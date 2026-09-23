import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import './styles.css';

type Scenario = {
  id: number;
  scenario_id: string;
  name: string;
  test_step: string;
  expected_result: string;
  status: string;
  favorite: boolean;
  last_execution?: string;
};

type Rule = {
  id: number;
  target: string;
  operator: string;
  expected: string;
  enabled: boolean;
  result?: boolean;
  actual?: unknown;
};

type Resp = {
  status: number;
  headers: Record<string, string>;
  body: string;
  elapsed_ms: number;
  size: number;
  timestamp: string;
  error_type?: string;
  error?: string;
};

type Attachment = {
  id: number;
  file_name: string;
  description: string;
  size: number;
  relative_path: string;
  created_at: string;
};

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ops = ['equals', 'not equal', 'contains', 'not contains', 'starts with', 'ends with', 'exists', 'not exists', 'null', 'not null', 'empty', 'not empty', 'greater', 'greater or equal', 'less', 'less or equal', 'regex', 'type is'];

function buildRequestUrl(rawUrl: string, params: any[]) {
  try {
    const url = new URL(rawUrl);
    params
      .filter((param) => param?.enabled && String(param?.key ?? '').trim())
      .forEach((param) => {
        url.searchParams.set(String(param.key).trim(), String(param.value ?? ''));
      });
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function safeJson(body: string): any {
  try {
    return JSON.parse(body || '{}');
  } catch {
    return body || '';
  }
}

function displayJson(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function resolveTargetValue(response: Resp | undefined, target: string): unknown {
  if (!response) return undefined;
  const normalized = target.trim();
  if (!normalized) return undefined;

  if (normalized === 'response.status') return response.status;
  if (normalized === 'response.headers') return response.headers;
  if (normalized === 'response.body') return safeJson(response.body);
  if (normalized === 'response.timestamp') return response.timestamp;

  const route = normalized.split('.');
  let current: any = response;
  for (const part of route) {
    if (part === 'response') continue;
    if (current == null) return undefined;
    if (typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function compareValue(actual: unknown, expected: string, operator: string): boolean {
  const asStr = actual === undefined || actual === null ? '' : String(actual);
	switch (operator) {
    case 'equals':
      return String(actual ?? '') === expected;
    case 'not equal':
      return String(actual ?? '') !== expected;
    case 'contains':
      return asStr.includes(expected);
    case 'not contains':
      return !asStr.includes(expected);
    case 'starts with':
      return asStr.startsWith(expected);
    case 'ends with':
      return asStr.endsWith(expected);
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'not exists':
      return actual === undefined || actual === null;
    case 'null':
      return actual === null || actual === 'null';
    case 'not null':
      return actual !== null && actual !== 'null';
    case 'empty':
      return asStr.trim() === '' || (Array.isArray(actual) && actual.length === 0);
    case 'not empty':
      return !(asStr.trim() === '' || (Array.isArray(actual) && actual.length === 0));
    case 'greater':
      return Number(actual) > Number(expected);
    case 'greater or equal':
      return Number(actual) >= Number(expected);
    case 'less':
      return Number(actual) < Number(expected);
    case 'less or equal':
      return Number(actual) <= Number(expected);
    case 'type is':
      return typeof actual === expected;
    case 'regex': {
      try {
        return new RegExp(expected).test(asStr);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

function App() {
  const [projects, setProjects] = useState<any[]>([]);
  const [project, setProject] = useState<any>();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selected, setSelected] = useState<Scenario>();
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('https://api.example.com/customer/detail');
  const [params, setParams] = useState<any[]>([]);
  const [headers, setHeaders] = useState<any[]>([]);
  const [body, setBody] = useState('{\n  "customerId": 123456\n}');
  const [auth, setAuth] = useState('No Auth');
  const [token, setToken] = useState('');
  const [basicUser, setBasicUser] = useState('');
  const [basicPass, setBasicPass] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState<number[]>([]);
  const [response, setResponse] = useState<Resp>();
  const [busy, setBusy] = useState(false);
  const [mock, setMock] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'request' | 'response' | 'validation' | 'history' | 'attachments'>('request');
  const [execs, setExecs] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<number[]>([]);

  const filtered = useMemo(
    () => scenarios.filter((s) => `${s.scenario_id} ${s.name}`.toLowerCase().includes(query.toLowerCase())),
    [scenarios, query],
  );

  const validationRows = useMemo(() => {
    return rules.map((rule) => {
      const actual = response ? resolveTargetValue(response, rule.target) : undefined;
      const result = response ? compareValue(actual, rule.expected, rule.operator) : undefined;
      return {
        ...rule,
        actual,
        result,
      };
    });
  }, [response, rules]);

  async function load() {
    try {
      const p = await invoke<any[]>('list_projects');
      setProjects(p);
      if (!project && p[0]) {
        setProject(p[0]);
        await loadScenarios(p[0].id);
      }
    } catch (e) {
      setMessage(String(e));
    }
  }

  async function loadScenarios(pid: number) {
    try {
      const s = await invoke<Scenario[]>('list_scenarios', { projectId: pid });
      setScenarios(s);
      if (s[0]) {
        await selectScenario(s[0]);
      }
    } catch (e) {
      setMessage(String(e));
    }
  }

  async function selectScenario(s: Scenario) {
    setSelected(s);
    setTab('request');
    setResponse(undefined);
    setSelectedRuleIds([]);
    setSelectedAttachmentIds([]);
    try {
      const d = await invoke<any>('get_scenario', { scenarioId: s.id });
      const request = d.request || {};
      setRules(d.rules || []);
      setMethod(request.method || 'GET');
      setUrl(request.url || '');
      setParams(request.params || []);
      setHeaders(request.headers || []);
      setBody(request.body || '');
      setAuth(request.auth || 'No Auth');
      setAttachments(await invoke<Attachment[]>('list_attachments', { scenarioId: s.id }));
      setExecs(await invoke<any[]>('list_executions', { scenarioId: s.id }));
    } catch (e) {
      setMessage(String(e));
    }
  }

  useEffect(() => { load(); }, []);

  function addParam() {
    setParams((p) => [...p, { enabled: true, key: '', value: '', kind: 'String', description: '' }]);
  }

  function addHeader() {
    setHeaders((h) => [...h, { enabled: true, key: '', value: '' }]);
  }

  function addRule() {
    setRules((r) => [...r, { id: Date.now(), target: 'body.status', operator: 'equals', expected: '', enabled: true }]);
  }

  function removeSelectedRules() {
    if (!selectedRuleIds.length) return;
    setRules((r) => r.filter((rule) => !selectedRuleIds.includes(rule.id)));
    setSelectedRuleIds([]);
  }

  function removeRule(index: number) {
    setRules((r) => r.filter((_, i) => i !== index));
  }

  async function send() {
    if (!selected) return;
    setBusy(true);
    setMessage('');

    try {
      const request = {
        method,
        url: buildRequestUrl(url, params),
        params: [...params],
        headers: [...headers],
        body,
        auth,
        token,
        basicUser,
        basicPass,
        apiKey,
      };

      const r = await invoke<Resp>('execute_request', { request, mock });
      setResponse(r);
      setTab('response');

      const vr = await invoke<any>('validate_response', { scenarioId: selected.id, response: r, rules });
      setRules(vr.rules || rules);

      await invoke('save_scenario_request', {
        scenarioId: selected.id,
        request,
      });

      await invoke('record_execution', {
        projectId: project.id,
        scenarioId: selected.id,
        request,
        response: r,
        validation: vr,
      });

      setExecs(await invoke<any[]>('list_executions', { scenarioId: selected.id }));
      setMessage(vr.final_result || 'Request, response, and validation saved');
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createProject() {
    const name = prompt('Project name', 'Customer API UAT');
    if (!name) return;
    try {
      const id = await invoke<number>('create_project', { name, description: '' });
      const p = (await invoke<any[]>('list_projects')).find((x) => x.id === id);
      if (p) {
        setProject(p);
        await loadScenarios(id);
      }
    } catch (e) {
      setMessage(String(e));
    }
  }

  async function importExcel() {
    if (!project) return;
    try {
      const file = await open({ filters: [{ name: 'Excel', extensions: ['xlsx'] }], multiple: false });
      if (!file || Array.isArray(file)) return;

      const result = await invoke<any>('inspect_excel', { path: file });
      const sheet = prompt('Sheet name', result.sheets?.[0] || 'Sheet1');
      if (!sheet) return;

      const mapping = {
        scenario_id: prompt('Column for scenario number', 'No') || 'No',
        name: prompt('Column for scenario name', 'Skenario') || 'Skenario',
        test_step: prompt('Column for test step (optional)', 'Test Step') || 'Test Step',
        expected_result: prompt('Column for expected result', 'Expected') || 'Expected',
      };

      await invoke('import_excel', { projectId: project.id, path: file, sheet, mapping });
      await loadScenarios(project.id);
      setMessage('Excel imported');
    } catch (e) {
      setMessage(String(e));
    }
  }

  async function addAttachment() {
    if (!selected) return;
    try {
      const rawFiles = await open({ multiple: true });
      if (!rawFiles) return;
      const files = Array.isArray(rawFiles) ? rawFiles : [rawFiles];
      for (const path of files) {
        const description = prompt('Attachment description', '') || '';
        await invoke('add_attachment', { scenarioId: selected.id, path, description });
      }
      setAttachments(await invoke<Attachment[]>('list_attachments', { scenarioId: selected.id }));
      setMessage(`${files.length} attachment(s) added`);
    } catch (e) {
      setMessage(String(e));
    }
  }

  async function removeSelectedAttachments() {
    if (!selectedAttachmentIds.length) return;
    try {
      for (const id of selectedAttachmentIds) {
        await invoke('remove_attachment', { id });
      }
      setAttachments((current) => current.filter((att) => !selectedAttachmentIds.includes(att.id)));
      setSelectedAttachmentIds([]);
      setMessage('Selected attachment(s) removed');
    } catch (e) {
      setMessage(String(e));
    }
  }

  async function exportEvidence() {
    if (!selected || !execs[0]) return;
    try {
      const file = await save({
        defaultPath: `${selected.scenario_id}-evidence.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }],
      });
      if (file) {
        await invoke('export_evidence', { executionId: execs[0].id, path: file });
      }
    } catch (e) {
      setMessage(String(e));
    }
  }

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        send();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selected, method, url, params, headers, body, auth, token, basicUser, basicPass, apiKey, rules, mock]);

  return (
    <div className="app">
      <header>
        <div>
          <b>API UAT Workspace</b>
          <span className="sub">Phase 1 • Local-first UAT execution</span>
        </div>
        <div className="top">
          <span>{project?.name || 'No project'}</span>
          <button onClick={createProject}>New Project</button>
          <button onClick={importExcel} disabled={!project}>Import Excel</button>
        </div>
      </header>

      <main>
        <aside>
          <div className="sideTitle">PROJECTS</div>
          {projects.map((p) => (
            <button
              key={p.id}
              className={'project ' + (project?.id === p.id ? 'sel' : '')}
              onClick={() => { setProject(p); loadScenarios(p.id); }}
            >
              {p.name}
            </button>
          ))}

          <div className="sideTitle scenarios">SCENARIOS</div>
          <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          {filtered.map((s) => (
            <button
              key={s.id}
              className={'scenario ' + (selected?.id === s.id ? 'sel' : '')}
              onClick={() => selectScenario(s)}
            >
              <span>{s.scenario_id}</span>
              <small>{s.status}</small>
              <em>{s.name}</em>
            </button>
          ))}
        </aside>

        <section className="workspace">
          <div className="scenarioHead">
            <div>
              <h2>{selected?.scenario_id || 'No scenario selected'}</h2>
              <div>{selected?.name || 'Select a scenario to begin'}</div>
            </div>
            {selected && <div className="badge">{selected.status}</div>}
          </div>

          <nav>
            <button className={tab === 'request' ? 'active' : ''} onClick={() => setTab('request')}>REQUEST BUILDER</button>
            <button className={tab === 'response' ? 'active' : ''} onClick={() => setTab('response')}>RESPONSE</button>
            <button className={tab === 'validation' ? 'active' : ''} onClick={() => setTab('validation')}>EXPECTED VS ACTUAL ({rules.length})</button>
            <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>HISTORY ({execs.length})</button>
            <button className={tab === 'attachments' ? 'active' : ''} onClick={() => setTab('attachments')}>ATTACHMENTS ({attachments.length})</button>
          </nav>

          {tab === 'request' && (
            <div className="panel">
              <div className="sendrow">
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {methods.map((m) => <option key={m}>{m}</option>)}
                </select>
                <input className="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/resource" />
                <label className="mock"><input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} /> Mock</label>
                <button className="send" onClick={send} disabled={busy || !selected}>{busy ? 'SENDING...' : 'SEND'}</button>
              </div>

              <h3>Parameters</h3>
              <table>
                <thead>
                  <tr><th>On</th><th>Key</th><th>Value</th><th>Type</th><th>Description</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {params.map((p, i) => (
                    <tr key={i}>
                      <td><input type="checkbox" checked={!!p.enabled} onChange={(e) => setParams((x) => x.map((v, n) => n === i ? { ...v, enabled: e.target.checked } : v))} /></td>
                      <td><input value={p.key} onChange={(e) => setParams((x) => x.map((v, n) => n === i ? { ...v, key: e.target.value } : v))} /></td>
                      <td><input value={p.value} onChange={(e) => setParams((x) => x.map((v, n) => n === i ? { ...v, value: e.target.value } : v))} /></td>
                      <td><input value={p.kind || 'String'} onChange={(e) => setParams((x) => x.map((v, n) => n === i ? { ...v, kind: e.target.value } : v))} /></td>
                      <td><input value={p.description || ''} onChange={(e) => setParams((x) => x.map((v, n) => n === i ? { ...v, description: e.target.value } : v))} /></td>
                      <td><button className="rowRemove" onClick={() => setParams((x) => x.filter((_, n) => n !== i))}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="link" onClick={addParam}>+ Add parameter</button>

              <h3>Headers</h3>
              <table>
                <thead><tr><th>On</th><th>Key</th><th>Value</th><th>Action</th></tr></thead>
                <tbody>
                  {headers.map((h, i) => (
                    <tr key={i}>
                      <td><input type="checkbox" checked={!!h.enabled} onChange={(e) => setHeaders((x) => x.map((v, n) => n === i ? { ...v, enabled: e.target.checked } : v))} /></td>
                      <td><input value={h.key} onChange={(e) => setHeaders((x) => x.map((v, n) => n === i ? { ...v, key: e.target.value } : v))} /></td>
                      <td><input type="password" value={h.value} onChange={(e) => setHeaders((x) => x.map((v, n) => n === i ? { ...v, value: e.target.value } : v))} /></td>
                      <td><button className="rowRemove" onClick={() => setHeaders((x) => x.filter((_, n) => n !== i))}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="link" onClick={addHeader}>+ Add header</button>

              <h3>Authentication</h3>
              <div className="auth">
                <select value={auth} onChange={(e) => setAuth(e.target.value)}>
                  <option>No Auth</option>
                  <option>Bearer Token</option>
                  <option>Basic Auth</option>
                  <option>API Key</option>
                </select>
                {auth === 'Bearer Token' && <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Bearer token" />}
                {auth === 'Basic Auth' && (
                  <>
                    <input value={basicUser} onChange={(e) => setBasicUser(e.target.value)} placeholder="Username" />
                    <input type="password" value={basicPass} onChange={(e) => setBasicPass(e.target.value)} placeholder="Password" />
                  </>
                )}
                {auth === 'API Key' && <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key" />}
              </div>

              <h3>Body</h3>
              <textarea className="body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="{\n  \"customerId\": 123456\n}" />
            </div>
          )}

          {tab === 'response' && (
            <div className="panel">
              <div className="responseMeta">
                {response ? (
                  <>
                    <b>HTTP {response.status}</b>
                    <span>{response.elapsed_ms} ms</span>
                    <span>{response.size} bytes</span>
                    <span>{response.timestamp}</span>
                  </>
                ) : <span>No response yet</span>}
              </div>

              {response?.error && <div className="errorBox"><b>{response.error_type}</b><div>{response.error}</div></div>}

              {response && (
                <>
                  <pre className="responseBox">{displayJson(safeJson(response.body))}</pre>
                  <div className="jsonWrap"><JsonTable value={safeJson(response.body)} /></div>
                </>
              )}

              <div className="actionRow">
                <button onClick={exportEvidence}>Export HTML</button>
              </div>
            </div>
          )}

          {tab === 'validation' && (
            <div className="panel">
              <div className="rulebar">
                <div>
                  <b>Expected vs Actual</b>
                  <div className="hint">Expected diisi manual pada JSON path. Nilai dari Excel tidak dipakai untuk komparasi.</div>
                </div>
                <div className="actionRow compact">
                  <button onClick={addRule}>+ Add comparison</button>
                  <button onClick={removeSelectedRules} disabled={!selectedRuleIds.length} className="rowRemove">Remove selected</button>
                </div>
              </div>

              <table className="compareTable">
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>JSON Path</th>
                    <th>Operator</th>
                    <th>Expected</th>
                    <th>Actual</th>
                    <th>Result</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {validationRows.map((rule, index) => (
                    <tr key={rule.id || index}>
                      <td><input type="checkbox" checked={selectedRuleIds.includes(rule.id)} onChange={() => setSelectedRuleIds((ids) => ids.includes(rule.id) ? ids.filter((id) => id !== rule.id) : [...ids, rule.id])} /></td>
                      <td><input value={rule.target} onChange={(e) => setRules((x) => x.map((v, i) => i === index ? { ...v, target: e.target.value } : v))} /></td>
                      <td>
                        <select value={rule.operator} onChange={(e) => setRules((x) => x.map((v, i) => i === index ? { ...v, operator: e.target.value } : v))}>
                          {ops.map((op) => <option key={op}>{op}</option>)}
                        </select>
                      </td>
                      <td><input value={rule.expected} onChange={(e) => setRules((x) => x.map((v, i) => i === index ? { ...v, expected: e.target.value } : v))} /></td>
                      <td className="jsonValue">{rule.actual === undefined ? '—' : displayJson(rule.actual)}</td>
                      <td>{rule.result === undefined ? '—' : rule.result ? 'PASS' : 'FAIL'}</td>
                      <td><button className="rowRemove" onClick={() => removeRule(index)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="hint">Contoh path: response.status, response.body, body.status, body.data.id</div>
            </div>
          )}

          {tab === 'history' && (
            <div className="panel">
              {execs.length === 0 ? (
                <div className="emptyState">No executions yet.</div>
              ) : execs.map((e: any) => (
                <div className="execution" key={e.id}>
                  <b>Execution #{e.execution_number}</b>
                  <span>{e.final_result}</span>
                  <small>{e.created_at}</small>
                </div>
              ))}
            </div>
          )}

          {tab === 'attachments' && (
            <div className="panel">
              <div className="rulebar">
                <b>Scenario attachments</b>
                <div className="actionRow compact">
                  <button onClick={addAttachment}>+ Add attachment</button>
                  <button onClick={removeSelectedAttachments} disabled={!selectedAttachmentIds.length}>Remove selected</button>
                </div>
              </div>

              {attachments.length === 0 ? (
                <div className="emptyState">No attachments yet.</div>
              ) : attachments.map((a) => (
                <div className="attachmentRow" key={a.id}>
                  <div className="attachmentMeta">
                    <label className="checkboxRow">
                      <input type="checkbox" checked={selectedAttachmentIds.includes(a.id)} onChange={() => setSelectedAttachmentIds((ids) => ids.includes(a.id) ? ids.filter((id) => id !== a.id) : [...ids, a.id])} />
                      {a.file_name}
                    </label>
                    <small>{Math.round(a.size / 1024)} KB</small>
                  </div>
                  <div>{a.description}</div>
                </div>
              ))}
            </div>
          )}

          {message && <div className="toast">{message}</div>}
        </section>
      </main>

      <footer>Local data • Native HTTP • No telemetry</footer>
    </div>
  );
}

function JsonTable({ value }: { value: any }) {
  const rows = useMemo(() => {
    if (value === null || value === undefined) return [{ key: 'value', value: 'null', type: 'null' }];
    if (typeof value !== 'object') return [{ key: 'value', value: String(value), type: typeof value }];
    return Object.entries(value).map(([key, item]) => ({
      key,
      value: typeof item === 'object' ? JSON.stringify(item) : String(item ?? 'null'),
      type: Array.isArray(item) ? 'array' : typeof item,
    }));
  }, [value]);

  return (
    <table className="jsonTable">
      <thead>
        <tr>
          <th>Key</th>
          <th>Value</th>
          <th>Type</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={`${row.key}-${idx}`}>
            <td>{row.key}</td>
            <td className="jsonValue">{row.value}</td>
            <td>{row.type}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
