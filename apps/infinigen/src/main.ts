import './style.css';
import { infinigenStreamUrl, parseInfinigenHash } from './args';
import { connectInfinigenStream } from './stream';
import { InfinigenViewer } from './viewer';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Expected #root element');
}

const viewer = new InfinigenViewer(root);
let stream: AbortController | undefined;

function reconnect(): void {
  stream?.abort();
  const args = parseInfinigenHash(window.location.search || window.location.hash);

  if (args.error !== undefined) {
    viewer.streamError(args.error);
    return;
  }

  viewer.setSpeechMode(args.speech);
  stream = connectInfinigenStream(infinigenStreamUrl(window.location.href, args), {
    bytes: (bytesPerSecond) => viewer.setNetworkThroughput(bytesPerSecond),
    close: () => undefined,
    error: (error) => viewer.streamError(error),
    event: (event) => viewer.apply(event)
  });
}

reconnect();
window.addEventListener('hashchange', reconnect);
window.addEventListener('popstate', reconnect);

window.addEventListener('beforeunload', () => {
  stream?.abort();
  window.removeEventListener('hashchange', reconnect);
  window.removeEventListener('popstate', reconnect);
  viewer.dispose();
});
