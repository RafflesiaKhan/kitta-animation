import { useEffect, useState, type FormEvent } from 'react';
import type { Episode, EpisodeScene, EpisodeSceneInput, Project, ProjectScenePreview, ProjectStyle } from '../shared/projects';
import { EXPRESSIONS, GESTURES, type ArtCharacter } from '../shared/types';
import { ProjectCharacters } from './ProjectCharacters';
import { ScenePlayer } from './ScenePreview';
import { createEpisode, createProject, getEpisodeScene, getProject, importProjectAsset,
  listProjectCharacters, listProjects, renderEpisodeScene, saveEpisodeScene, saveFirstScene, saveProjectCharacter } from './api';

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project>();
  const [episode, setEpisode] = useState<Episode>();
  const [preview, setPreview] = useState<ProjectScenePreview>();
  const [video, setVideo] = useState<string>();
  const [tab, setTab] = useState('Overview');
  const [characters, setCharacters] = useState<ArtCharacter[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setError('');
    setBusy(true);
    try { return await action(); }
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

  function showCharacters() {
    setTab('Characters');
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
    const scene = episode.projectScene;
    const edited = scene && 'characterId' in scene ? scene : undefined;
    function remember(saved: Episode) {
      setEpisode(saved);
      setProject(current => current && {
        ...current, episodes: current.episodes.map(item => item.id === episodeId ? saved : item),
      });
    }
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
        {error && <p className="error" role="alert">{error}</p>}
        {busy && <p role="status">Working…</p>}
        {(!scene || edited) && <EpisodeSceneForm key={episodeId} project={project} scene={edited} busy={busy}
          onSave={input => void run(async () => {
            const saved = await saveEpisodeScene(projectId, episodeId, input);
            remember(saved);
            setVideo(undefined);
            setPreview(undefined);
            setPreview(await getEpisodeScene(projectId, episodeId));
          })} />}
        {preview && <ScenePlayer scene={preview.scene} audioUrl={preview.audioUrl} />}
        {episode.projectScene ? <>
          {!preview && <button className="btn secondary" disabled={busy} onClick={() => void run(async () => {
            setPreview(await getEpisodeScene(projectId, episodeId));
          })}>Load saved scene</button>}
          <button className="btn" disabled={busy} onClick={() => void run(async () => {
            setVideo(URL.createObjectURL(await renderEpisodeScene(projectId, episodeId)));
          })}>Render scene</button>
          {video && <a className="btn secondary" href={video} download="scene.mp4">Download MP4</a>}
        </> : project.style === 'svg' ? <button className="btn" disabled={busy} onClick={() => void run(async () => {
          const saved = { ...episode, projectScene: await saveFirstScene(projectId, episodeId) };
          remember(saved);
          setProject(await getProject(projectId));
          setPreview(await getEpisodeScene(projectId, episodeId));
        })}>Save first scene</button> : null}
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
          {error && <p className="error" role="alert">{error}</p>}
          {!project ? <>
            <h2>Create a cartoon project</h2>
            <p>Build a cast and a world you can bring back in every episode.</p>
            <form className="project-form" onSubmit={event => submit(event, async data => {
              open(await createProject({ name: String(data.get('name')), premise: String(data.get('premise')), style: data.get('style') as ProjectStyle }));
            })}>
              <label className="field">Project name <input name="name" required maxLength={100} /></label>
              <label className="field">Series premise <textarea name="premise" maxLength={2000} /></label>
              <label className="field">Visual style <select name="style"><option value="svg">SVG</option><option value="ai">AI</option></select></label>
              <button className="btn" disabled={busy}>Create project</button>
            </form>
          </> : <>
            <h2>{project.name}</h2>
            <p>Visual style {project.style === 'svg' ? 'SVG' : 'AI'}</p>
            {project.premise && <p>{project.premise}</p>}
            <nav className="project-tabs" aria-label="Project workspace">
              {['Overview', 'Characters', 'Assets', 'Episodes'].map(item => <button className={tab === item ? 'btn' : 'btn secondary'} key={item} disabled={busy}
                aria-pressed={tab === item} onClick={() => item === 'Characters' ? showCharacters() : setTab(item)}>{item}</button>)}
            </nav>
            {tab === 'Overview' && <>
              <h3>Start with your cast</h3>
              <p>{project.style === 'svg'
                ? 'Customize a reusable SVG starter in Characters.'
                : 'Use an existing painted character from the saved library in Characters.'}</p>
              <button className="btn secondary" disabled={busy} onClick={showCharacters}>Open character editor</button>
            </>}
            {tab === 'Characters' && <ProjectCharacters project={project} library={characters} busy={busy}
              onSave={(input, id) => run(async () => {
                const saved = await saveProjectCharacter(project.id, input, id);
                setProject(saved);
                return saved;
              })} />}
            {tab === 'Assets' && <>
              <h3>Project assets</h3>
              <form className="project-form" onSubmit={event => submit(event, async data => {
                setProject(await importProjectAsset(project.id, data));
              })}>
                <label className="field">Image, SVG or audio <input type="file" name="media" accept="image/png,image/jpeg,image/webp,image/svg+xml,audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg" required /></label>
                <button className="btn" disabled={busy}>Import media</button>
              </form>
              {project.assets.length === 0 && <p>This project has no assets yet.</p>}
              <ul className="project-assets">{project.assets.map(asset => <li key={asset.id}>
                {asset.kind !== 'character' ? <a href={'/api/projects/' + project.id + '/assets/' + asset.id} download={asset.name}>{asset.name}</a> : asset.name}
                <span>{asset.kind}</span>
              </li>)}</ul>
            </>}
            {tab === 'Episodes' && <>
              <h3>Episodes</h3>
              <form className="project-form" onSubmit={event => submit(event, async data => {
                const created = await createEpisode(project.id, String(data.get('title')));
                setProject({ ...project, episodes: [...project.episodes, created] });
              })}>
                <label className="field">Episode title <input name="title" required maxLength={100} /></label>
                <button className="btn" disabled={busy}>Create episode</button>
              </form>
              {project.episodes.map(item => <button className="btn secondary project-row" key={item.id} disabled={busy} onClick={() => void run(async () => {
                setEpisode(item);
                if (item.projectScene) setPreview(await getEpisodeScene(project.id, item.id));
              })}>{item.title} · {item.projectScene ? 'Saved scene' : 'Open episode'}</button>)}
            </>}
          </>}
        </section>
        {!project && <section className="panel">
          <h2>Your projects</h2>
          {projects.length === 0 && <p>Your saved cartoon projects will appear here.</p>}
          {projects.map(item => <button className="btn secondary project-row" disabled={busy} key={item.id} onClick={() => void run(async () => {
            open(await getProject(item.id));
          })}>{item.name} · {item.episodes.length} episodes</button>)}
        </section>}
      </main>
    </div>
  );
}

function EpisodeSceneForm({ project, scene, busy, onSave }: {
  project: Project; scene?: EpisodeScene; busy: boolean; onSave: (input: EpisodeSceneInput) => void;
}) {
  const sets = project.assets.filter(asset => asset.kind === 'image' || asset.kind === 'svg');
  if (!project.characters?.length || !sets.length) {
    return <p className="hint">Save a project character and import a background in Assets to set up a scene.</p>;
  }
  return <form className="project-form" onSubmit={event => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    onSave({ characterId: String(data.get('characterId')), backgroundAssetId: String(data.get('backgroundAssetId')),
      expression: data.get('expression') as EpisodeSceneInput['expression'], gesture: data.get('gesture') as EpisodeSceneInput['gesture'],
      x: Number(data.get('x')), scale: Number(data.get('scale')), groundY: Number(data.get('groundY')) });
  }}>
    <fieldset className="fields" disabled={busy}>
      <label className="field">Scene character <select name="characterId" defaultValue={scene?.characterId}>{project.characters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field">Scene set <select name="backgroundAssetId" defaultValue={scene?.backgroundAssetId}>{sets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field">Expression <select name="expression" defaultValue={scene?.expression}>{EXPRESSIONS.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="field">Gesture <select name="gesture" defaultValue={scene?.gesture}>{GESTURES.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="field">Horizontal position <input name="x" type="number" min="0" max="1" step="0.01" required defaultValue={scene?.x ?? 0.5} /></label>
      <label className="field">Scale <input name="scale" type="number" min="0.1" max="2" step="0.01" required defaultValue={scene?.scale ?? 0.8} /></label>
      <label className="field">Stage ground position <input name="groundY" type="number" min="0" max="1" step="0.01" required defaultValue={scene?.groundY ?? 0.85} /></label>
    </fieldset>
    <p className="hint">Positions use 0–1 across the stage. The character's ground anchor sits at the stage ground position.</p>
    <button className="btn" disabled={busy}>Save scene</button>
  </form>;
}
