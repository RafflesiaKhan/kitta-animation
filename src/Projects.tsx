import { useEffect, useState, type FormEvent } from 'react';
import type { Episode, Project, ProjectScenePreview, ProjectStyle } from '../shared/projects';
import { ScenePlayer } from './ScenePreview';
import { addProjectCharacter, createEpisode, createProject, getEpisodeScene, getProject, importProjectAsset,
  listProjectCharacters, listProjects, renderEpisodeScene, saveFirstScene } from './api';

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project>();
  const [episode, setEpisode] = useState<Episode>();
  const [preview, setPreview] = useState<ProjectScenePreview>();
  const [video, setVideo] = useState<string>();
  const [tab, setTab] = useState('Overview');
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setError('');
    setBusy(true);
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    void run(async () => setProjects(await listProjects()));
  }, []);

  useEffect(() => {
    if (video) return () => URL.revokeObjectURL(video);
  }, [video]);

  function open(next: Project) {
    setProject(next);
    setCharacters([]);
    setTab('Overview');
  }

  function showAssets() {
    setTab('Assets');
    if (project?.style === 'ai') void run(async () => setCharacters(await listProjectCharacters()));
  }

  function submit(event: FormEvent<HTMLFormElement>, action: (data: FormData) => Promise<void>) {
    event.preventDefault();
    const form = event.currentTarget;
    void run(async () => { await action(new FormData(form)); form.reset(); });
  }

  if (project && episode) {
    const projectId = project.id;
    const episodeId = episode.id;
    return <div className="app">
      <header>
        <button className="pill" disabled={busy} onClick={() => {
          setEpisode(undefined);
          setPreview(undefined);
          setVideo(undefined);
          setError('');
        }}>Back to episodes</button>
      </header>
      <main className="project-episode"><section className="panel" aria-busy={busy}>
        <h2>{episode.title}</h2>
        {error && <p role="alert">{error}</p>}
        {busy && <p role="status">Working…</p>}
        {preview && <ScenePlayer scene={preview.scene} audioUrl={preview.audioUrl} />}
        {episode.projectScene ? <>
          {!preview && <button disabled={busy} onClick={() => void run(async () => {
            setPreview(await getEpisodeScene(projectId, episodeId));
          })}>Load saved scene</button>}
          <button disabled={busy} onClick={() => void run(async () => {
            setVideo(URL.createObjectURL(await renderEpisodeScene(projectId, episodeId)));
          })}>Render scene</button>
          {video && <a href={video} download="scene.mp4">Download MP4</a>}
        </> : project.style === 'svg' ? <button disabled={busy} onClick={() => void run(async () => {
          const saved = { ...episode, projectScene: await saveFirstScene(projectId, episodeId) };
          setEpisode(saved);
          setProject(current => current && {
            ...current, episodes: current.episodes.map(item => item.id === episodeId ? saved : item),
          });
          setProject(await getProject(projectId));
          setPreview(await getEpisodeScene(projectId, episodeId));
        })}>Save first scene</button> : <p>This episode has no saved scene. The first-scene sample uses SVG characters.</p>}
      </section></main>
    </div>;
  }

  return (
    <div className="app">
      <header>
        <div className="brand"><h1>Kitta Cartoon Studio</h1><span className="tagline">Projects and reusable assets</span></div>
        <a className="pill" href="/?character-studio">Character Studio</a>
        {project && <button className="pill" disabled={busy} onClick={() => void run(async () => {
          setProjects(await listProjects()); setProject(undefined);
        })}>All projects</button>}
      </header>
      <main>
        <section className="panel">
          {error && <p role="alert">{error}</p>}
          {!project ? <>
            <h2>Create a cartoon project</h2>
            <p>Build a cast and a world you can bring back in every episode.</p>
            <form className="project-form" onSubmit={event => submit(event, async data => {
              open(await createProject({ name: String(data.get('name')), premise: String(data.get('premise')), style: data.get('style') as ProjectStyle }));
            })}>
              <label>Project name <input name="name" required maxLength={100} /></label>
              <label>Series premise <textarea name="premise" maxLength={2000} /></label>
              <label>Visual style <select name="style"><option value="svg">SVG</option><option value="ai">AI</option></select></label>
              <button disabled={busy}>Create project</button>
            </form>
          </> : <>
            <h2>{project.name}</h2>
            <p>Visual style {project.style === 'svg' ? 'SVG' : 'AI'}</p>
            {project.premise && <p>{project.premise}</p>}
            <nav className="project-tabs" aria-label="Project workspace">
              {['Overview', 'Assets', 'Episodes'].map(item => <button key={item} disabled={busy}
                aria-pressed={tab === item} onClick={() => item === 'Assets' ? showAssets() : setTab(item)}>{item}</button>)}
            </nav>
            {tab === 'Overview' && <>
              <h3>Start with your cast</h3>
              <p>Bring in a saved character or open Character Studio to create one.</p>
              <button disabled={busy} onClick={showAssets}>Open asset library</button>
            </>}
            {tab === 'Assets' && <>
              <h3>Project assets</h3>
              <form className="project-form" onSubmit={event => submit(event, async data => {
                setProject(await importProjectAsset(project.id, data));
              })}>
                <label>Image, SVG or audio <input type="file" name="media" accept="image/png,image/jpeg,image/webp,image/svg+xml,audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/ogg" required /></label>
                <button disabled={busy}>Import media</button>
              </form>
              {project.style === 'ai' && characters.length > 0 && <form className="project-form" onSubmit={event => submit(event, async data => {
                setProject(await addProjectCharacter(project.id, String(data.get('characterId'))));
              })}>
                <label>Saved AI character <select name="characterId">{characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <button disabled={busy}>Add character to project</button>
              </form>}
              {project.assets.length === 0 && <p>This project has no assets yet.</p>}
              <ul>{project.assets.map(asset => <li key={asset.id}>
                {asset.kind !== 'character' ? <a href={'/api/projects/' + project.id + '/assets/' + asset.id} download={asset.name}>{asset.name}</a> : asset.name}
                {' · ' + asset.kind}
              </li>)}</ul>
            </>}
            {tab === 'Episodes' && <>
              <h3>Episodes</h3>
              <form className="project-form" onSubmit={event => submit(event, async data => {
                const created = await createEpisode(project.id, String(data.get('title')));
                setProject({ ...project, episodes: [...project.episodes, created] });
              })}>
                <label>Episode title <input name="title" required maxLength={100} /></label>
                <button disabled={busy}>Create episode</button>
              </form>
              {project.episodes.map(item => <button className="project-row" key={item.id} disabled={busy} onClick={() => void run(async () => {
                setEpisode(item);
                if (item.projectScene) setPreview(await getEpisodeScene(project.id, item.id));
              })}>{item.title} · {item.projectScene ? 'Saved scene' : 'Open episode'}</button>)}
            </>}
          </>}
        </section>
        {!project && <section className="panel">
          <h2>Your projects</h2>
          {projects.length === 0 && <p>Your saved cartoon projects will appear here.</p>}
          {projects.map(item => <button className="project-row" disabled={busy} key={item.id} onClick={() => void run(async () => {
            open(await getProject(item.id));
          })}>{item.name} · {item.episodes.length} episodes</button>)}
        </section>}
      </main>
    </div>
  );
}
