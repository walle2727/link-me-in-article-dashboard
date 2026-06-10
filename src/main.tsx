import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Archive, BarChart3, Calendar, CheckCircle2, ExternalLink, Filter, History, Inbox, KeyRound, LayoutDashboard, ListChecks, Lock, Save, Search, Star, TrendingUp } from 'lucide-react';
import {
  DATA_PATHS,
  DEFAULT_GITHUB_TARGET,
  applyArticleStatus,
  decryptJson,
  draftFromQueueItem,
  isEncryptedEnvelope,
  reorderQueue,
  saveEncryptedJsonToGitHub,
  type Article,
  type ArticleStatus,
  type EncryptedEnvelope,
  type QueueItem,
  type Post,
} from './data';
import './styles.css';

const DATA_BASE = `${import.meta.env.BASE_URL}data`;

type DataSet = 'articles' | 'queue' | 'posts';
type ActiveView = 'inbox' | 'queue' | 'history' | 'stats';

type DashboardData = {
  articles: Article[];
  queue: QueueItem[];
  posts: Post[];
};

const themeLabels: Record<string, string> = {
  'responsible-ai': 'Responsible AI',
  'cybersecurity-trust': 'Cybersecurity / trust',
  'software-development': 'Software development',
  'builder-workflows': 'Builder workflows',
  'building-in-public': 'Building in public',
  governance: 'Governance',
  privacy: 'Privacy',
  'ai-governance': 'AI governance',
  'edge-ai': 'Edge AI',
  'human-oversight': 'Human oversight',
  trust: 'Trust',
  'agentic-workflows': 'Agentic workflows',
  'test-automation': 'Test automation',
};

function priorityScore(article: Article) {
  return Math.round(article.timeliness * 5 + article.audienceFit * 5 + article.practicalValue * 4 + article.originality * 3 + article.sourceQuality * 3 + article.agentScore * 0.35);
}

function formatDate(value?: string | null) {
  if (!value) return 'Unscheduled';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-GB', { month: 'short', day: '2-digit', year: 'numeric' }).format(date);
}

function normalizeFoundAt(value: string) {
  return value.replace(/\.\d+/, '').replace(' ', 'T');
}

async function fetchJson(path: DataSet) {
  const response = await fetch(`${DATA_BASE}/${path}.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load ${path}.json (${response.status}).`);
  return response.json();
}

async function decryptDataSet<T>(path: DataSet, passphrase: string): Promise<T> {
  const payload = await fetchJson(path);
  if (isEncryptedEnvelope(payload)) return decryptJson<T>(payload, passphrase);
  return payload as T;
}

function App() {
  const [data, setData] = useState<DashboardData>({ articles: [], queue: [], posts: [] });
  const [passphrase, setPassphrase] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [active, setActive] = useState<ActiveView>('inbox');
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<'newest' | 'score' | 'priority'>('priority');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<DataSet | null>(null);
  const [message, setMessage] = useState('Dashboard data is encrypted. Unlock it with the shared passphrase.');
  const [draft, setDraft] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const { articles, queue, posts } = data;

  const themes = useMemo(() => Array.from(new Set(articles.flatMap((a) => a.themes))).sort(), [articles]);
  const stats = useMemo(() => {
    const shortlisted = articles.filter((a) => a.status === 'shortlisted').length;
    const selected = articles.filter((a) => ['shortlisted', 'queued', 'used'].includes(a.status)).length;
    const rejected = articles.filter((a) => a.status === 'rejected').length;
    const avgScore = articles.length ? Math.round(articles.reduce((sum, a) => sum + priorityScore(a), 0) / articles.length) : 0;
    return { total: articles.length, shortlisted, selected, rejected, avgScore, queued: queue.length, posts: posts.length };
  }, [articles, queue.length, posts.length]);

  const filtered = useMemo(() => {
    let result = articles.filter((article) => {
      const haystack = `${article.title} ${article.summary} ${article.suggestedAngle} ${article.source}`.toLowerCase();
      return (
        (query.trim() === '' || haystack.includes(query.toLowerCase())) &&
        (theme === 'all' || article.themes.includes(theme)) &&
        (status === 'all' || article.status === status)
      );
    });
    result = result.sort((a, b) => {
      if (sort === 'newest') return normalizeFoundAt(b.foundAt).localeCompare(normalizeFoundAt(a.foundAt));
      if (sort === 'score') return b.agentScore - a.agentScore;
      return priorityScore(b) - priorityScore(a);
    });
    return result;
  }, [articles, query, sort, status, theme]);

  const unlocked = articles.length > 0 || queue.length > 0 || posts.length > 0;

  async function unlock() {
    setLoading(true);
    setMessage('Decrypting dashboard data…');
    try {
      const [nextArticles, nextQueue, nextPosts] = await Promise.all([
        decryptDataSet<Article[]>('articles', passphrase),
        decryptDataSet<QueueItem[]>('queue', passphrase),
        decryptDataSet<Post[]>('posts', passphrase),
      ]);
      setData({ articles: nextArticles, queue: nextQueue, posts: nextPosts });
      setMessage('Unlocked. Passphrase stays in browser memory only. GitHub token is only used when you press Save.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not unlock dashboard.');
    } finally {
      setLoading(false);
    }
  }

  function updateArticle(id: string, patch: Partial<Article>) {
    if (patch.status) {
      setData((current) => {
        const next = applyArticleStatus({ articles: current.articles, queue: current.queue }, id, patch.status!);
        const articles = next.articles.map((article) => article.id === id ? { ...article, ...patch } : article);
        const article = current.articles.find((item) => item.id === id);
        const statusLabel = patch.status === 'queued' ? 'Future pile' : patch.status;
        setMessage(article ? `Moved “${article.title}” to ${statusLabel}. Save articles + queue to persist.` : 'Status updated.');
        return { ...current, articles, queue: next.queue };
      });
      return;
    }
    setData((current) => ({ ...current, articles: current.articles.map((article) => article.id === id ? { ...article, ...patch } : article) }));
  }

  function updateQueue(nextQueue: QueueItem[]) {
    setData((current) => ({ ...current, queue: nextQueue }));
  }

  async function saveDataSet(path: DataSet, payload: Article[] | QueueItem[] | Post[]) {
    if (!githubToken.trim()) {
      setMessage('Paste a fine-grained GitHub token with Contents read/write before saving.');
      return;
    }
    setSaving(path);
    setMessage(`Saving encrypted ${path}.json to GitHub…`);
    try {
      await saveEncryptedJsonToGitHub({
        target: DEFAULT_GITHUB_TARGET,
        path: DATA_PATHS[path],
        token: githubToken.trim(),
        passphrase,
        data: payload,
        message: `chore(data): update encrypted ${path} data`,
      });
      setMessage(`Saved encrypted ${path}.json to GitHub. GitHub Pages will redeploy from main.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not save ${path}.json.`);
    } finally {
      setSaving(null);
    }
  }

  async function saveAllWorkflowData() {
    if (!githubToken.trim()) {
      setMessage('Paste a fine-grained GitHub token with Contents read/write before saving.');
      return;
    }
    setSaving('articles');
    setMessage('Saving encrypted article reviews and queue to GitHub…');
    try {
      await saveEncryptedJsonToGitHub({
        target: DEFAULT_GITHUB_TARGET,
        path: DATA_PATHS.articles,
        token: githubToken.trim(),
        passphrase,
        data: articles,
        message: 'chore(data): update encrypted article reviews',
      });
      await saveEncryptedJsonToGitHub({
        target: DEFAULT_GITHUB_TARGET,
        path: DATA_PATHS.queue,
        token: githubToken.trim(),
        passphrase,
        data: queue,
        message: 'chore(data): update encrypted queue',
      });
      setMessage('Saved encrypted article reviews and queue to GitHub. GitHub Pages will redeploy from main.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save workflow data.');
    } finally {
      setSaving(null);
    }
  }

  function exportReviewJson() {
    const blob = new Blob([JSON.stringify(articles, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `articles-reviewed-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!unlocked) {
    return <UnlockScreen passphrase={passphrase} setPassphrase={setPassphrase} onUnlock={unlock} loading={loading} message={message} />;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brandIcon">in</div><div><strong>Link Me In</strong><span>Article Dashboard</span></div></div>
        <nav>
          <button className={active === 'inbox' ? 'active' : ''} onClick={() => setActive('inbox')}><Inbox size={18} /> Article inbox</button>
          <button className={active === 'queue' ? 'active' : ''} onClick={() => setActive('queue')}><ListChecks size={18} /> Future pile</button>
          <button className={active === 'history' ? 'active' : ''} onClick={() => setActive('history')}><History size={18} /> Post history</button>
          <button className={active === 'stats' ? 'active' : ''} onClick={() => setActive('stats')}><BarChart3 size={18} /> Stats</button>
        </nav>
        <div className="note">
          <strong>Encrypted static mode</strong>
          <p>The repo is private and the public data files are encrypted AES-GCM envelopes. The token below is not stored.</p>
          <label className="stacked"><span>GitHub token for save</span><input type="password" value={githubToken} onChange={(event) => setGithubToken(event.target.value)} placeholder="fine-grained Contents RW token" /></label>
          <button className="secondary full" disabled={saving !== null} onClick={saveAllWorkflowData}><Save size={15} /> Save workflow data</button>
          <p className="tiny">Changing an article to Queue now creates/removes a Future pile card immediately.</p>
          <p className="tiny">{message}</p>
        </div>
      </aside>

      <main>
        <header className="hero">
          <div><p className="eyebrow">Hermes cron scout → encrypted editorial workflow</p><h1>Turn article scouting into a LinkedIn content pipeline.</h1><p className="subtle">Rate, shortlist, queue, draft and persist decisions back to encrypted GitHub data.</p></div>
          <div className="heroCard"><TrendingUp size={22} /><span>{stats.total} candidates</span><strong>{stats.avgScore}</strong><small>avg priority signal</small></div>
        </header>

        <section className="metricGrid">
          <Metric icon={<Inbox />} label="Cron candidates" value={stats.total} />
          <Metric icon={<CheckCircle2 />} label="Selected" value={stats.selected} />
          <Metric icon={<Calendar />} label="Future pile" value={stats.queued} />
          <Metric icon={<Archive />} label="Published history" value={stats.posts} />
        </section>

        {active === 'inbox' && (
          <section className="panel">
            <div className="panelHeader"><div><h2>Article inbox</h2><p>Review candidates found by the current-thread scout. Changing status now moves the article through the workflow piles.</p></div><div className="buttonRow"><button className="secondary" onClick={exportReviewJson}>Export JSON</button><button className="secondary" disabled={saving !== null} onClick={saveAllWorkflowData}><Save size={15} /> Save workflow</button></div></div>
            <div className="pileStrip">
              <button className={status === 'new' ? 'active' : ''} onClick={() => setStatus('new')}><strong>{articles.filter((a) => a.status === 'new').length}</strong><span>New</span></button>
              <button className={status === 'shortlisted' ? 'active' : ''} onClick={() => setStatus('shortlisted')}><strong>{stats.shortlisted}</strong><span>Shortlist</span></button>
              <button onClick={() => setActive('queue')}><strong>{stats.queued}</strong><span>Future pile</span></button>
              <button className={status === 'rejected' ? 'active' : ''} onClick={() => setStatus('rejected')}><strong>{stats.rejected}</strong><span>Rejected</span></button>
            </div>
            <div className="filters">
              <label className="search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search subjects, sources, angles…" /></label>
              <label><Filter size={17} /> Theme<select value={theme} onChange={(e) => setTheme(e.target.value)}><option value="all">All themes</option>{themes.map((t) => <option key={t} value={t}>{themeLabels[t] ?? t}</option>)}</select></label>
              <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All</option><option value="new">New</option><option value="shortlisted">Shortlisted</option><option value="queued">Queued</option><option value="rejected">Rejected</option><option value="used">Used</option></select></label>
              <label>Sort<select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="priority">Priority score</option><option value="newest">Newest</option><option value="score">Agent score</option></select></label>
            </div>
            <div className="cards">{filtered.map((article) => <ArticleCard key={article.id} article={article} onUpdate={updateArticle} />)}</div>
          </section>
        )}

        {active === 'queue' && <QueueView queue={queue} articles={articles} draft={draft} setDraft={setDraft} dragIndex={dragIndex} setDragIndex={setDragIndex} onQueueChange={updateQueue} onSave={() => saveDataSet('queue', queue)} />}
        {active === 'history' && <HistoryView posts={posts} />}
        {active === 'stats' && <StatsView articles={articles} posts={posts} queue={queue} />}
      </main>
    </div>
  );
}

function UnlockScreen({ passphrase, setPassphrase, onUnlock, loading, message }: { passphrase: string; setPassphrase: (value: string) => void; onUnlock: () => void; loading: boolean; message: string }) {
  return <main className="unlock"><section className="unlockCard"><div className="lockIcon"><Lock /></div><p className="eyebrow">Private working dashboard</p><h1>Unlock Link Me In.</h1><p className="subtle">The app shell is static, but dashboard JSON is encrypted before publishing. Enter the shared passphrase to decrypt it locally in this browser.</p><label className="stacked"><span>Dashboard passphrase</span><input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onUnlock(); }} autoFocus /></label><button className="primary" disabled={loading} onClick={onUnlock}><KeyRound size={17} /> {loading ? 'Unlocking…' : 'Unlock dashboard'}</button><p className="tiny">{message}</p></section></main>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="metric"><span>{icon}</span><small>{label}</small><strong>{value}</strong></div>;
}

function Stars({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  return <div className="stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => onChange(n)} className={(value ?? 0) >= n ? 'filled' : ''} title={`${n} stars`}><Star size={17} /></button>)}</div>;
}

function ArticleCard({ article, onUpdate }: { article: Article; onUpdate: (id: string, patch: Partial<Article>) => void }) {
  return <article className={`article ${article.status}`}><div className="articleTop"><div><div className="badges">{article.themes.map((theme) => <span key={theme}>{themeLabels[theme] ?? theme}</span>)}<span className="status">{article.status}</span></div><h3>{article.title}</h3></div><div className="score"><small>priority</small><strong>{priorityScore(article)}</strong></div></div><p><strong>Why now:</strong> {article.summary || 'No summary captured yet.'}</p><p><strong>Stefan angle:</strong> {article.suggestedAngle || 'Needs angle refinement.'}</p><div className="articleMeta"><span>{formatDate(article.foundAt)}</span><span>{article.source}</span><span>agent {article.agentScore}</span></div><div className="links">{article.sourceLinks?.slice(0, 3).map((link) => <a key={link} href={link} target="_blank" rel="noreferrer">Source <ExternalLink size={14} /></a>)}</div><div className="reviewRow"><Stars value={article.userRating} onChange={(value) => onUpdate(article.id, { userRating: value })} /><select value={article.status} onChange={(event) => onUpdate(article.id, { status: event.target.value as ArticleStatus })}><option value="new">New</option><option value="shortlisted">Shortlist</option><option value="queued">Queue</option><option value="rejected">Reject</option><option value="used">Used</option></select></div><textarea placeholder="Add review notes…" value={article.notes} onChange={(e) => onUpdate(article.id, { notes: e.target.value })} /></article>;
}

function QueueView({ queue, articles, draft, setDraft, dragIndex, setDragIndex, onQueueChange, onSave }: { queue: QueueItem[]; articles: Article[]; draft: string; setDraft: (value: string) => void; dragIndex: number | null; setDragIndex: (value: number | null) => void; onQueueChange: (queue: QueueItem[]) => void; onSave: () => void }) {
  const byId = new Map(articles.map((a) => [a.id, a]));
  const ordered = [...queue].sort((a, b) => a.priority - b.priority);
  return <section className="panel"><div className="panelHeader"><div><h2>Future LinkedIn article pile</h2><p>Drag to reorder, then save the encrypted queue back to GitHub.</p></div><button className="secondary" onClick={onSave}><Save size={15} /> Save queue order</button></div><div className="queueGrid"><div className="queueList">{ordered.map((item, index) => <div className={`queueItem ${dragIndex === index ? 'dragging' : ''}`} draggable key={item.id} onDragStart={() => setDragIndex(index)} onDragEnd={() => setDragIndex(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragIndex !== null) onQueueChange(reorderQueue(ordered, dragIndex, index)); setDragIndex(null); }}><div className="priority">#{item.priority}</div><div><h3>{item.workingTitle}</h3><p>{item.angle}</p><div className="articleMeta"><span>{item.status}</span><span>{item.postType}</span><span>{formatDate(item.plannedFor)}</span></div>{item.articleIds.map((id) => byId.get(id)).filter(Boolean).map((article) => <a className="sourceLine" key={article!.id} href={article!.url || '#'} target="_blank" rel="noreferrer">Linked candidate: {article!.title}</a>)}<small>{item.notes}</small><button className="secondary compact" onClick={() => setDraft(draftFromQueueItem(item, articles))}>Draft from this</button></div></div>)}</div><div className="draftBox"><h3>Draft from selected item</h3><p>Generated locally from the queue angle and linked sources. Edit/copy before publishing.</p><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Choose “Draft from this” on a queue item…" /></div></div></section>;
}

function HistoryView({ posts }: { posts: Post[] }) {
  return <section className="panel"><div className="panelHeader"><div><h2>Post history</h2><p>Published posts from the current LinkedIn plan.</p></div></div><div className="historyList">{posts.map((post) => <div className="historyItem" key={post.id}><div><strong>{formatDate(post.publishedAt)}</strong><h3>{post.title}</h3><p>{post.notes}</p><div className="badges">{post.themes.map((theme) => <span key={theme}>{themeLabels[theme] ?? theme}</span>)}</div></div>{post.url && <a href={post.url} target="_blank" rel="noreferrer">Open <ExternalLink size={14} /></a>}</div>)}</div></section>;
}

function StatsView({ articles, posts, queue }: { articles: Article[]; posts: Post[]; queue: QueueItem[] }) {
  const counts = articles.reduce<Record<string, number>>((acc, article) => { article.themes.forEach((theme) => { acc[theme] = (acc[theme] ?? 0) + 1; }); return acc; }, {});
  return <section className="panel"><div className="panelHeader"><div><h2>Stats</h2><p>Editorial signals across the encrypted working data.</p></div></div><div className="statColumns"><div><h3>Theme mix</h3>{Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([theme, count]) => <div className="bar" key={theme}><span>{themeLabels[theme] ?? theme}</span><div><i style={{ width: `${Math.min(100, count * 6)}%` }} /></div><strong>{count}</strong></div>)}</div><div className="roadmap"><h3>Battle-test checklist</h3><ul><li>Encrypted static data for privacy.</li><li>GitHub API write-back for review persistence.</li><li>Cron-generated structured candidates.</li><li>Drag queue ordering and draft scaffolds.</li></ul><p>{articles.length} candidates · {queue.length} queued ideas · {posts.length} historical posts</p></div></div></section>;
}

createRoot(document.getElementById('root')!).render(<App />);
