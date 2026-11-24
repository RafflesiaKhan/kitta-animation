import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Projects } from './Projects';
import { ScenePreview } from './ScenePreview';
import { Settings } from './Settings';
import './styles.css';

const query = new URLSearchParams(window.location.search);
const scene = query.get('scene');
// The Character Studio is the home page (/?character-studio still opens it); Projects is in beta at /?projects.
const page = scene ? <ScenePreview name={scene} /> : query.has('settings') ? <Settings /> : query.has('projects') ? <Projects /> : <App />;

createRoot(document.getElementById('root')!).render(page);
