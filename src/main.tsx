import { render } from 'preact';
import { App } from './ui/App';

const root = document.getElementById('app');
if (!root) throw new Error('找不到 #app 挂载点');

render(<App />, root);
