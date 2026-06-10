import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Archive, BarChart3, Calendar, CheckCircle2, ExternalLink, Filter, History, Inbox, LayoutDashboard, ListChecks, Search, Star, TrendingUp } from 'lucide-react';
import './styles.css';

type ArticleStatus = 'new' | 'shortlisted' | 'rejected' | 'queued' | 'used';

type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  foundAt: string;
  publishedAt: string;
  summary: string;
  suggestedAngle: string;
  themes: string[];
  lane: string;
  status: ArticleStatus;
  agentScore: number;
  userRating: number | null;
  notes: string;
  sourceQuality: number;
  timeliness: number;
  audienceFit: number;
  practicalValue: number;
  originality: number;
  sourceLinks: string[];
};

type QueueItem = {
  id: string;
  articleIds: string[];
  workingTitle: string;
  angle: string;
  status: 'ideas' | 'selected' | 'needs-research' | 'ready-to-draft' | 'drafted' | 'published';
  priority: number;
  plannedFor: string | null;
  postType: string;
  notes: string;
  createdAt: string;
};

type Post = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  themes: string[];
  sourceArticleIds: string[];
  notes: string;
};

const DATA_BASE = `${import.meta.env.BASE_URL}data`;

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
  return Math.round(
    article.timeliness * 5 +
      article.audienceFit * 5 +
      article.practicalValue * 4 +
      article.originality * 3 +
      article.sourceQuality * 3 +
      article.agentScore * 0.35,
  );
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

function App() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [active, setActive] = useState<'inbox' | 'queue' | 'history' | 'stats'>('inbox');
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<'newest' | 'score' | 'priority'>('priority');
  const [localEdits, setLocalEdits] = useState<Record<string, Partial<Article>>>({});

  useEffect(() => {
    async function load() {
      const [a, q, p] = await Promise.all([
        fetch(`${DATA_BASE}/articles.json`).then((r) => r.json()),
        fetch(`${DATA_BASE}/queue.json`).then((r) => r.json()),
        fetch(`${DATA_BASE}/posts.json`).then((r) => r.json()),
      ]);
      setArticles(a);
      setQueue(q);
      setPosts(p);
    }
    load().catch((error) => console.error('Failed to load dashboard data', error));
  }, []);

  const mergedArticles = useMemo(
    () => articles.map((article) => ({ ...article, ...localEdits[article.id] })),
    [articles, localEdits],
  );

  const themes = useMemo(() => Array.from(new Set(mergedArticles.flatMap((a) => a.themes))).sort(), [mergedArticles]);
  const stats = useMemo(() => {
    const selected = mergedArticles.filter((a) => ['shortlisted', 'queued', 'used'].includes(a.status)).length;
    const rejected = mergedArticles.filter((a) => a.status === 'rejected').length;
    const avgScore = mergedArticles.length ? Math.round(mergedArticles.reduce((sum, a) => sum + priorityScore(a), 0) / mergedArticles.length) : 0;
    return { total: mergedArticles.length, selected, rejected, avgScore, queued: queue.length, posts: posts.length };
  }, [mergedArticles, queue.length, posts.length]);

  const filtered = useMemo(() => {
    let result = mergedArticles.filter((article) => {
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
  }, [mergedArticles, query, sort, status, theme]);

  function updateArticle(id: string, patch: Partial<Article>) {
    setLocalEdits((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function exportReviewJson() {
    const data = JSON.stringify(mergedArticles, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `articles-reviewed-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandIcon">in</div>
          <div>
            <strong>Link Me In</strong>
            <span>Article Dashboard</span>
          </div>
        </div>
        <nav>
          <button className={active === 'inbox' ? 'active' : ''} onClick={() => setActive('inbox')}><Inbox size={18} /> Article inbox</button>
          <button className={active === 'queue' ? 'active' : ''} onClick={() => setActive('queue')}><ListChecks size={18} /> Future pile</button>
          <button className={active === 'history' ? 'active' : ''} onClick={() => setActive('history')}><History size={18} /> Post history</button>
          <button className={active === 'stats' ? 'active' : ''} onClick={() => setActive('stats')}><BarChart3 size={18} /> Stats</button>
        </nav>
        <div className="note">
          <strong>MVP mode</strong>
          <p>Review changes are kept in browser state. Export JSON now; GitHub write-back comes next.</p>
        </div>
      </aside>

      <main>
        <header className="hero">
          <div>
            <p className="eyebrow">Hermes cron scout → editorial workflow</p>
            <h1>Turn article scouting into a LinkedIn content pipeline.</h1>
            <p className="subtle">Seeded from past cron results and the existing LinkedIn plan. Rate, shortlist, queue and review what deserves a post.</p>
          </div>
          <div className="heroCard">
            <TrendingUp size={22} />
            <span>{stats.total} candidates</span>
            <strong>{stats.avgScore}</strong>
            <small>avg priority signal</small>
          </div>
        </header>

        <section className="metricGrid">
          <Metric icon={<Inbox />} label="Cron candidates" value={stats.total} />
          <Metric icon={<CheckCircle2 />} label="Selected locally" value={stats.selected} />
          <Metric icon={<Calendar />} label="Future pile" value={stats.queued} />
          <Metric icon={<Archive />} label="Published history" value={stats.posts} />
        </section>

        {active === 'inbox' && (
          <section className="panel">
            <div className="panelHeader">
              <div>
                <h2>Article inbox</h2>
                <p>Review candidates found by the current-thread scout.</p>
              </div>
              <button className="secondary" onClick={exportReviewJson}>Export reviewed JSON</button>
            </div>
            <div className="filters">
              <label className="search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search subjects, sources, angles…" /></label>
              <label><Filter size={17} /> Theme<select value={theme} onChange={(e) => setTheme(e.target.value)}><option value="all">All themes</option>{themes.map((t) => <option key={t} value={t}>{themeLabels[t] ?? t}</option>)}</select></label>
              <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All</option><option value="new">New</option><option value="shortlisted">Shortlisted</option><option value="queued">Queued</option><option value="rejected">Rejected</option></select></label>
              <label>Sort<select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="priority">Priority score</option><option value="newest">Newest</option><option value="score">Agent score</option></select></label>
            </div>
            <div className="cards">
              {filtered.map((article) => <ArticleCard key={article.id} article={article} onUpdate={updateArticle} />)}
            </div>
          </section>
        )}

        {active === 'queue' && <QueueView queue={queue} articles={mergedArticles} />}
        {active === 'history' && <HistoryView posts={posts} />}
        {active === 'stats' && <StatsView articles={mergedArticles} posts={posts} queue={queue} />}
      </main>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="metric"><span>{icon}</span><small>{label}</small><strong>{value}</strong></div>;
}

function Stars({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  return <div className="stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => onChange(n)} className={(value ?? 0) >= n ? 'filled' : ''} title={`${n} stars`}><Star size={17} /></button>)}</div>;
}

function ArticleCard({ article, onUpdate }: { article: Article; onUpdate: (id: string, patch: Partial<Article>) => void }) {
  return (
    <article className={`article ${article.status}`}>
      <div className="articleTop">
        <div>
          <div className="badges">
            {article.themes.map((theme) => <span key={theme}>{themeLabels[theme] ?? theme}</span>)}
            <span className="status">{article.status}</span>
          </div>
          <h3>{article.title}</h3>
        </div>
        <div className="score"><small>priority</small><strong>{priorityScore(article)}</strong></div>
      </div>
      <p><strong>Why now:</strong> {article.summary || 'No summary captured yet.'}</p>
      <p><strong>Stefan angle:</strong> {article.suggestedAngle || 'Needs angle refinement.'}</p>
      <div className="articleMeta">
        <span>{formatDate(article.foundAt)}</span>
        <span>{article.source}</span>
        <span>agent {article.agentScore}</span>
      </div>
      <div className="links">
        {article.sourceLinks?.slice(0, 3).map((link) => <a key={link} href={link} target="_blank" rel="noreferrer">Source <ExternalLink size={14} /></a>)}
      </div>
      <div className="reviewRow">
        <Stars value={article.userRating} onChange={(value) => onUpdate(article.id, { userRating: value })} />
        <select value={article.status} onChange={(event) => onUpdate(article.id, { status: event.target.value as ArticleStatus })}>
          <option value="new">New</option>
          <option value="shortlisted">Shortlist</option>
          <option value="queued">Queue</option>
          <option value="rejected">Reject</option>
          <option value="used">Used</option>
        </select>
      </div>
      <textarea placeholder="Add review notes…" value={article.notes} onChange={(e) => onUpdate(article.id, { notes: e.target.value })} />
    </article>
  );
}

function QueueView({ queue, articles }: { queue: QueueItem[]; articles: Article[] }) {
  const byId = new Map(articles.map((a) => [a.id, a]));
  return <section className="panel"><div className="panelHeader"><div><h2>Future LinkedIn article pile</h2><p>Initial order seeded from the existing plan plus strong current-thread candidates.</p></div></div><div className="queueList">{queue.sort((a, b) => a.priority - b.priority).map((item) => <div className="queueItem" key={item.id}><div className="priority">#{item.priority}</div><div><h3>{item.workingTitle}</h3><p>{item.angle}</p><div className="articleMeta"><span>{item.status}</span><span>{item.postType}</span><span>{formatDate(item.plannedFor)}</span></div>{item.articleIds.map((id) => byId.get(id)).filter(Boolean).map((article) => <a className="sourceLine" key={article!.id} href={article!.url || '#'} target="_blank" rel="noreferrer">Linked candidate: {article!.title}</a>)}<small>{item.notes}</small></div></div>)}</div></section>;
}

function HistoryView({ posts }: { posts: Post[] }) {
  return <section className="panel"><div className="panelHeader"><div><h2>Post history</h2><p>Published posts from the current LinkedIn plan.</p></div></div><div className="historyList">{posts.map((post) => <div className="historyItem" key={post.id}><div><strong>{formatDate(post.publishedAt)}</strong><h3>{post.title}</h3><p>{post.notes}</p><div className="badges">{post.themes.map((theme) => <span key={theme}>{themeLabels[theme] ?? theme}</span>)}</div></div>{post.url && <a href={post.url} target="_blank" rel="noreferrer">Open <ExternalLink size={14} /></a>}</div>)}</div></section>;
}

function StatsView({ articles, posts, queue }: { articles: Article[]; posts: Post[]; queue: QueueItem[] }) {
  const counts = articles.reduce<Record<string, number>>((acc, article) => { article.themes.forEach((theme) => { acc[theme] = (acc[theme] ?? 0) + 1; }); return acc; }, {});
  return <section className="panel"><div className="panelHeader"><div><h2>Stats</h2><p>Early editorial signals. More analytics can come after GitHub write-back.</p></div></div><div className="statColumns"><div><h3>Theme mix</h3>{Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([theme, count]) => <div className="bar" key={theme}><span>{themeLabels[theme] ?? theme}</span><div><i style={{ width: `${Math.min(100, count * 6)}%` }} /></div><strong>{count}</strong></div>)}</div><div className="roadmap"><h3>Next iterations</h3><ul><li>Persist review actions back to GitHub JSON.</li><li>Update the Hermes cron to append candidates directly.</li><li>Add drag-and-drop ordering for the future pile.</li><li>Track LinkedIn performance metrics per post.</li></ul><p>{articles.length} candidates · {queue.length} queued ideas · {posts.length} historical posts</p></div></div></section>;
}

createRoot(document.getElementById('root')!).render(<App />);
