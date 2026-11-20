import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Projects } from './Projects';
import { ScenePreview } from './ScenePreview';
import './styles.css';

const query = new URLSearchParams(window.location.search);
const scene = query.get('scene');
const page = scene ? <ScenePreview name={scene} /> : query.has('character-studio') ? <App /> : <Projects />;

createRoot(document.getElementById('root')!).render(page);
