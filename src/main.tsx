import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ScenePreview } from './ScenePreview';
import './styles.css';

const scene = new URLSearchParams(window.location.search).get('scene');

createRoot(document.getElementById('root')!).render(scene ? <ScenePreview name={scene} /> : <App />);
