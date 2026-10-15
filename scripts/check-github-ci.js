// Read the public GitHub Actions page when API egress is unavailable.
// Parse data only; never evaluate HTML/scripts or infer success from a push.
async function check(sha) {
  if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Supply the full commit SHA');
  const response = await fetch(
    'https://github.com/Arpan9058/Prepto/actions?query=branch%3Amain+event%3Apush',
    { signal: AbortSignal.timeout(20000) },
  );
  if (!response.ok) throw new Error(`GitHub page returned ${response.status}`);
  const html = await response.text();
  const scripts = [
    ...html.matchAll(
      /<script type="application\/json" data-target="react-app.embeddedData">([\s\S]*?)<\/script>/g,
    ),
  ];
  const runs = scripts.flatMap(
    (s) => JSON.parse(s[1]).payload?.allWorkflowRunsRoute?.workflowRuns || [],
  );
  const run = runs.find(
    (r) =>
      r.workflowFilePath === '.github/workflows/check.yml' &&
      r.branch?.name === 'refs/heads/main' &&
      r.description?.linkUrl === `/Arpan9058/Prepto/commit/${sha}`,
  );
  if (!run) {
    console.log(JSON.stringify({ sha, status: 'not-found-yet' }));
    return 2;
  }
  const state = run.state;
  console.log(
    JSON.stringify({ sha, status: state.status, conclusion: state.conclusion, url: run.runUrl }),
  );
  if (state.status !== 'WORKFLOW_RUN_STATUS_COMPLETED') return 2;
  return state.conclusion === 'WORKFLOW_RUN_CONCLUSION_SUCCESS' ? 0 : 1;
}
if (require.main === module)
  check(process.argv[2])
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
module.exports = { check };
