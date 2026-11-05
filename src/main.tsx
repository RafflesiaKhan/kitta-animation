import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SceneSample } from './SceneSample';
import { Projects } from './Projects';
import './styles.css';

createRoot(document.getElementById('root')!).render(location.search === '?scene-sample' ? <SceneSample /> : location.search === '?character-studio' ? <App /> : <Projects />);
