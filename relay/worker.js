// Cloudflare Worker: receives feedback from the job-hunt dashboard and files it
// as a GitHub issue labeled "feedback", which the nightly search reads.
//
// Settings (Worker -> Settings -> Variables and Secrets):
//   GITHUB_TOKEN  (secret)  fine-grained token, repo job-hunt-dashboard only, Issues: Read and write
//   SUBMIT_KEY    (secret)  any passphrase; the dashboard asks for it once per device
//   REPO          (text)    patanjalibalaaditya/job-hunt-dashboard

const ALLOWED_ORIGIN = 'https://patanjalibalaaditya.github.io';

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    const reply = (text, status = 200, extra = {}) => new Response(text, { status, headers: { ...cors, ...extra } });

    if (request.method === 'OPTIONS') return reply(null, 204);
    if (request.method !== 'POST') return reply('Method not allowed', 405);

    let data;
    try { data = await request.json(); } catch { return reply('Bad request', 400); }

    if (!env.SUBMIT_KEY || data.key !== env.SUBMIT_KEY) return reply('Wrong feedback key', 401);

    const comment = String(data.comment || '').trim().slice(0, 4000);
    if (!comment) return reply('Empty comment', 400);

    const verdict = ['like', 'dislike', 'note'].includes(data.verdict) ? data.verdict : 'note';
    const job = data.job || {};
    const clean = (v, n) => String(v || '').replace(/[\r\n]+/g, ' ').slice(0, n);
    const icon = verdict === 'like' ? '👍' : verdict === 'dislike' ? '👎' : '💬';

    const issue = {
      title: `${icon} ${clean(job.company, 80) || '?'} – ${clean(job.role, 140) || '?'}`,
      body: [
        `Job ID: ${clean(job.id, 40)}`,
        `Verdict: ${verdict}`,
        `Company: ${clean(job.company, 80)}`,
        `Role: ${clean(job.role, 140)}`,
        `Link: ${clean(job.link, 500)}`,
        '',
        '## Your comment',
        comment,
      ].join('\n'),
      labels: ['feedback'],
    };

    const gh = await fetch(`https://api.github.com/repos/${env.REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'job-hunt-feedback-relay',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(issue),
    });
    if (!gh.ok) return reply(`GitHub said ${gh.status}`, 502);

    const created = await gh.json();
    return reply(JSON.stringify({ ok: true, number: created.number }), 200, { 'Content-Type': 'application/json' });
  },
};
