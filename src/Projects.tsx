import { useEffect, useState, type FormEvent } from 'react';
import type { Episode, Project } from '../shared/projects';
import { SceneSample } from './SceneSample';

async function request<T>(path: string, body?: FormData | Record<string, string>): Promise<T> {
  const options: RequestInit = body instanceof FormData ? { method: 'POST', body }
    : body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  const response = await fetch('/api/projects' + path, options);
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.error ?? 'The project request failed.');
  }
  return response.json();
}

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project>();
  const [episode, setEpisode] = useState<Episode>();
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
    void run(async () => setProjects(await request<Project[]>('')));
  }, []);

  function open(next: Project) {
    setProject(next);
    setTab('Overview');
  }

  function showAssets() {
    setTab('Assets');
    void run(async () => {
      const response = await fetch('/api/characters');
      if (!response.ok) throw new Error('Could not load the saved character library.');
      setCharacters((await response.json()).characters);
    });
  }

  function submit(event: FormEvent<HTMLFormElement>, action: (data: FormData) => Promise<void>) {
    event.preventDefault();
    const form = event.currentTarget;
    void run(async () => { await action(new FormData(form)); form.reset(); });
  }

  if (project && episode) {
    return <SceneSample key={episode.id} initialSample={episode.scene?.sample}
      endpoint={'/api/projects/' + project.id + '/episodes/' + episode.id + '/sample'}
      episodeTitle={episode.title} onBack={() => {
        setEpisode(undefined);
        void run(async () => setProject(await request<Project>('/' + project.id)));
      }} />;
  }

  return (
    <div className="app">
      <header>
        <div className="brand"><h1>Kitta Cartoon Studio</h1><span className="tagline">Projects and reusable assets</span></div>
        <a className="pill" href="/?character-studio">Character Studio</a>
        {project && <button className="pill" disabled={busy} onClick={() => void run(async () => {
          setProjects(await request<Project[]>('')); setProject(undefined);
        })}>All projects</button>}
      </header>
      <main>
        <section className="panel">
          {error && <p role="alert">{error}</p>}
          {!project ? <>
            <h2>Create a cartoon project</h2>
            <p>Build a cast and a world you can bring back in every episode.</p>
            <form className="project-form" onSubmit={event => submit(event, async data => {
              open(await request<Project>('', { name: String(data.get('name')), premise: String(data.get('premise')) }));
            })}>
              <label>Project name <input name="name" required maxLength={100} /></label>
              <label>Series premise <textarea name="premise" maxLength={2000} /></label>
              <button disabled={busy}>Create project</button>
            </form>
          </> : <>
            <h2>{project.name}</h2>
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
                setProject(await request<Project>('/' + project.id + '/assets', data));
              })}>
                <label>Image, SVG or audio <input type="file" name="media" accept="image/png,image/jpeg,image/webp,image/svg+xml,audio/*" required /></label>
                <button disabled={busy}>Import media</button>
              </form>
              {characters.length > 0 && <form className="project-form" onSubmit={event => submit(event, async data => {
                setProject(await request<Project>('/' + project.id + '/assets', { characterId: String(data.get('characterId')) }));
              })}>
                <label>Saved AI character <select name="characterId">{characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <button disabled={busy}>Add character to project</button>
              </form>}
              {project.assets.length === 0 && <p>This project has no assets yet.</p>}
              <ul>{project.assets.map(asset => <li key={asset.id}>
                {asset.mime ? <a href={'/api/projects/' + project.id + '/assets/' + asset.id} download={asset.name}>{asset.name}</a> : asset.name}
                {' · ' + asset.kind}
              </li>)}</ul>
            </>}
            {tab === 'Episodes' && <>
              <h3>Episodes</h3>
              <form className="project-form" onSubmit={event => submit(event, async data => {
                const created = await request<Episode>('/' + project.id + '/episodes', { title: String(data.get('title')) });
                setProject({ ...project, episodes: [...project.episodes, created] });
              })}>
                <label>Episode title <input name="title" required maxLength={100} /></label>
                <button disabled={busy}>Create episode</button>
              </form>
              {project.episodes.map(item => <button className="project-row" key={item.id} disabled={busy} onClick={() => void run(async () => {
                const fresh = await request<Project>('/' + project.id);
                setProject(fresh);
                setEpisode(fresh.episodes.find(candidate => candidate.id === item.id));
              })}>{item.title} · {item.scene ? 'Saved scene' : 'Open episode'}</button>)}
            </>}
          </>}
        </section>
        {!project && <section className="panel">
          <h2>Your projects</h2>
          {projects.length === 0 && <p>Your saved cartoon projects will appear here.</p>}
          {projects.map(item => <button className="project-row" disabled={busy} key={item.id} onClick={() => void run(async () => {
            open(await request<Project>('/' + item.id));
          })}>{item.name} · {item.episodes.length} episodes</button>)}
        </section>}
      </main>
    </div>
  );
}
