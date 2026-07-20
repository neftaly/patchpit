import type { AutomergeUrl } from '@automerge/automerge-repo';
import type { RecentBrowserRoot } from './root-host.ts';

export const RootFailure = ({ message, onFresh, onOpen, onRetry, recentRoots }: {
  readonly message: string;
  readonly onFresh: () => void;
  readonly onOpen: (rootUrl: AutomergeUrl) => void;
  readonly onRetry: () => void;
  readonly recentRoots: readonly RecentBrowserRoot[];
}) => <main>
  <p role="alert">{message}</p>
  <div>
    <button type="button" onClick={onRetry}>Retry</button>
    <button type="button" onClick={onFresh}>New demo</button>
  </div>
  {recentRoots.length === 0 ? null : <section aria-labelledby="recent-roots-title">
    <h2 id="recent-roots-title">Recent roots</h2>
    <ul>
      {recentRoots.map((record) => <li key={record.rootUrl}>
        <button type="button" onClick={() => onOpen(record.rootUrl)}>
          {record.bootstrap?.id === undefined
            ? record.rootUrl
            : `${record.bootstrap.id} generation ${record.bootstrap.generation} — ${record.rootUrl}`}
        </button>
      </li>)}
    </ul>
  </section>}
</main>;
