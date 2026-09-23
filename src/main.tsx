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
  category?: string;
};

type Rule = {
  id: number;
  target: string;
  operator: string;
  expected: string;
  enabled: boolean;
  result?: boolean;
  actual?: any;
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
const ops = ['equals', 'not equal', 'contains', 'not contains', 'starts with', 'ends with', 'exists', 'not exists', 'null', 'not null', 'empty', 'not empty', 'greater', 'greater or equal', 'less', 'less or equal'];
const mask = (k: string, v: string) => /authorization|cookie|set-cookie|api[-_]?key|token|password|secret/i.test(k) ? '********' : v;

function parseExcelNo(no: string) {
  const s = (no || '').trim();
  if (!s) return { kind: 'unknown', raw: s };
  if (/^[A-Z]$/i.test(s)) return { kind: 'parent', raw: s };
  if (/^[A-Za-z](\.\d+)+$/i.test(s) || /^[A-Za-z]\d+(?:\.\d+)*$/i.test(s)) return { kind: 'scenario', raw: s };
  if (/^\d+(?:\.\d+)*$/.test(s)) return { kind: 'step', raw: s };
  return { kind: 'scenario', raw: s };
}

function toJsonTableRows(value: any): Array<{ key: string; value: string; type: string }> {
  if (value === null || value === undefined) return [{ key: 'value', value: String(value ?? 'null'), type: 'null' }];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [{ key: 'value', value: String(value), type: typeof value }];
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      key: String(index),
      value: typeof item === 'object' ? JSON.stringify(item) : String(item ?? 'null'),
      type: Array.isArray(item) ? 'array' : typeof item,
    }));
  }
  if (typeof value === 'object') {
    return Object.entries(value).map(([key, val]) => ({
      key,
      value: typeof val === 'object' ? JSON.stringify(val) : String(val ?? 'null'),
      type: typeof val,
    }));
  }
  return [{ key: 'value', value: String(value), type: 'string' }];
}

function JsonTable({ value }: { value: any }) {
  const rows = useMemo(() => toJsonTableRows(value), [value]);
  if (!rows.length) return <div className="emptyState">No data</div>;
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
  const defaultBody = '{\n  "customerId": 123456\n}';
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
  const [compareRows, setCompareRows] = useState<any[]>([]);

  const filtered = useMemo(
    () => scenarios.filter((s) => `${s.scenario_id} ${s.name}`.toLowerCase().includes(query.toLowerCase())),
    [scenarios, query],
  );

  async function load() {
    try {
      const p = await invoke<any[]>('list_projects');
      setProjects(p);
      if (!project && p[0]) {
        setProject(p[0]);
        loadScenarios(p[0].id);
      }
    } catch (e) {
      setMessage(String(e));
    }
  }

  async function loadScenarios(pid: number) {
    const s = await invoke<Scenario[]>('list_scenarios', { projectId: pid });
    setScenarios(s);
    if (s[0]) selectScenario(s[0]);
  }

  async function selectScenario(s: Scenario) {
    setSelected(s);
    setTab('request');
    setResponse(undefined);
    setAttachments([]);
    setSelectedAttachmentIds([]);
    setSelectedRuleIds([]);
    try {
      const d = await invoke<any>('get_scenario', { scenarioId: s.id });
      setRules(d.rules || []);
      const req = d.request || {};
      setMethod(req.method || 'GET');
      setUrl(req.url || '');
      setParams(req.params || []);
      setHeaders(req.headers || []);
      setBody(req.body || '');
      setAuth(req.auth || 'No Auth');
      const att = await invoke<Attachment[]>('list_attachments', { scenarioId: s.id });
      setAttachments(att || []);
    } catch (e) {
      setMessage(String(e));
    }
  }

  useEffect(() => { load(); }, []);

  function addParam() {
    setParams([...params, { enabled: true, key: '', value: '', kind: 'String', description: '' }]);
  }

  function removeParam(index: number) {
    setParams((current) => current.filter((_, i) => i !== index));
  }

  function addHeader() {
    setHeaders([...headers, { enabled: true, key: '', value: '' }]);
  }

  function removeHeader(index: number) {
    setHeaders((current) => current.filter((_, i) => i !== index));
  }

  function addRule() {
    setRules([...rules, { id: Date.now(), target: 'body.status', operator: 'equals', expected: '200', enabled: true }]);
  }

  function removeRule(index: number) {
    setRules((current) => current.filter((_, i) => i !== index));
  }

  function toggleRuleSelection(id: number) {
    setSelectedRuleIds((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }

  function removeSelectedRules() {
    if (!selectedRuleIds.length) return;
    setRules((current) => current.filter((rule) => !selectedRuleIds.includes(rule.id)));
    setSelectedRuleIds([]);
  }

  async function send() {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      const request = { method, url, params, headers, body, auth, token, basicUser, basicPass, apiKey };
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
      setMessage(vr.final_result || 'Execution completed');
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createProject() {
    const name = prompt('Project name', 'Customer API UAT');
    if (!name) return;
    const id = await invoke<number>('create_project', { name, description: '' });
    await load();
    const p = (await invoke<any[]>('list_projects')).find((x) => x.id === id);
    if (p) {
      setProject(p);
      loadScenarios(id);
    }
  }

  async function importExcel() {
    if (!project) return;
    try {
      const f = await open({ filters: [{ name: 'Excel', extensions: ['xlsx'] }], multiple: false });
      if (!f || Array.isArray(f)) return;

      const result = await invoke<any>('inspect_excel', { path: f });
      const sheet = prompt('Sheet name', result.sheets?.[0] || 'Sheet1');
      if (!sheet) return;

      const mapping = {
        scenario_id: prompt('Column for scenario number', 'No') || 'No',
        name: prompt('Column for scenario name', 'Skenario') || 'Skenario',
        test_step: prompt('Column for test step (optional)', 'Test Step') || 'Test Step',
        expected_result: prompt('Column for expected result', 'Expected') || 'Expected',
      };

      await invoke('import_excel', {
        projectId: project.id,
        path: f,
        sheet,
        mapping,
      });

      await loadScenarios(project.id);
      setMessage('Excel imported');
    } catch (e) {
      setMessage(String(e));
    }
  }

  async function addAttachment() {
    if (!selected) return;
    try {
      const f = await open({ multiple: true });
      if (!f) return;
      const files = Array.isArray(f) ? f : [f];
      for (const path of files) {
        const description = prompt(`Description for ${path.split(/[\\/]/).pop() || 'attachment'}`, 'Attachment for UAT evidence') || 'Attachment for UAT evidence';
        await invoke('add_attachment', { scenarioId: selected.id, path, description });
      }
      const refreshed = await invoke<Attachment[]>('list_attachments', { scenarioId: selected.id });
      setAttachments(refreshed || []);
      setMessage(`${files.length} attachment(s) added`);
    } catch (e) {
      setMessage(String(e));
    }
  }

  function toggleAttachmentSelection(id: number) {
    setSelectedAttachmentIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
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

  async function updateAttachment(a: Attachment) {
    try {
      await invoke('update_attachment_description', { id: a.id, description: a.description });
      setMessage('Attachment description saved');
    } catch (e) {
      setMessage(String(e));
    }
  }

  async function removeAttachment(id: number) {
    try {
      await invoke('remove_attachment', { id });
      setAttachments((current) => current.filter((att) => att.id !== id));
      setSelectedAttachmentIds((current) => current.filter((x) => x !== id));
      setMessage('Attachment removed');
    } catch (e) {
      setMessage(String(e));
    }
  }

  async function exportEvidence() {
    if (!selected || !response) return;
    try {
      const p = await save({
        defaultPath: `${selected.scenario_id}-evidence.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }],
      });
      if (!p) return;
      await invoke('export_evidence', { executionId: execs[0]?.id || 0, path: p });
      setMessage('Evidence exported');
    } catch (e) {
      setMessage(String(e));
    }
  }

  useEffect(() => {
    if (selected) {
      invoke<any[]>('list_executions', { scenarioId: selected.id }).then(setExecs).catch(() => {});
    }
  }, [selected]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        send();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        exportEvidence();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selected, response, execs, busy]);

  useEffect(() => {
    const rows = scenarios.map((s, idx) => ({
      no: s.scenario_id || String(idx + 1),
      scenario: s.name,
      expected: s.expected_result,
      status: s.status,
    }));
    setCompareRows(rows);
  }, [scenarios]);

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
              <h2>{selected ? selected.scenario_id : 'No scenario selected'}</h2>
              <div>{selected ? selected.name : 'Select a scenario to begin'}</div>
            </div>
            {selected && (
              <div className={'badge ' + (selected.status === 'PASS' ? 'pass' : selected.status === 'FAIL' ? 'fail' : '')}>
                {selected.status}
              </div>
            )}
          </div>

          <nav>
            <button className={tab === 'request' ? 'active' : ''} onClick={() => setTab('request')}>REQUEST BUILDER</button>
            <button className={tab === 'response' ? 'active' : ''} onClick={() => setTab('response')}>RESPONSE</button>
            <button className={tab === 'validation' ? 'active' : ''} onClick={() => setTab('validation')}>VALIDATION ({rules.length})</button>
            <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>HISTORY ({execs.length})</button>
            <button className={tab === 'attachments' ? 'active' : ''} onClick={() => setTab('attachments')}>ATTACHMENTS ({attachments.length})</button>
          </nav>

          {tab === 'request' && (
            <div className="panel">
              <div className="sendrow">
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {methods.map((m) => <option key={m}>{m}</option>)}
                </select>
                <input className="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/customer/detail" />
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
                      <td><input type="checkbox" checked={p.enabled} onChange={(e) => { const x = [...params]; x[i].enabled = e.target.checked; setParams(x); }} /></td>
                      <td><input value={p.key} onChange={(e) => { const x = [...params]; x[i].key = e.target.value; setParams(x); }} /></td>
                      <td><input value={p.value} onChange={(e) => { const x = [...params]; x[i].value = e.target.value; setParams(x); }} /></td>
                      <td>
                        <select value={p.kind || 'String'} onChange={(e) => { const x = [...params]; x[i].kind = e.target.value; setParams(x); }}>
                          <option>String</option>
                          <option>Number</option>
                          <option>Boolean</option>
                          <option>JSON</option>
                        </select>
                      </td>
                      <td><input value={p.description || ''} onChange={(e) => { const x = [...params]; x[i].description = e.target.value; setParams(x); }} /></td>
                      <td><button className="rowRemove" onClick={() => removeParam(i)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="link" onClick={addParam}>+ Add parameter</button>

              <h3>Headers</h3>
              <table>
                <thead><tr><th>On</th><th>Key</th><th>Value</th><th>Action</th></tr></thead>
                <tbody>
                  {headers.map((p, i) => (
                    <tr key={i}>
                      <td><input type="checkbox" checked={p.enabled} onChange={(e) => { const x = [...headers]; x[i].enabled = e.target.checked; setHeaders(x); }} /></td>
                      <td><input value={p.key} onChange={(e) => { const x = [...headers]; x[i].key = e.target.value; setHeaders(x); }} /></td>
                      <td><input type="password" value={p.value} onChange={(e) => { const x = [...headers]; x[i].value = e.target.value; setHeaders(x); }} /></td>
                      <td><button className="rowRemove" onClick={() => removeHeader(i)}>Remove</button></td>
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
              <textarea className="body" value={body} onChange={(e) => setBody(e.target.value)} placeholder={defaultBody} />
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

              {response && <pre className="responseBox">{JSON.stringify(JSON.parse(response.body || '{}'), null, 2)}</pre>}

              {response && <div className="jsonWrap"><JsonTable value={JSON.parse(response.body || '{}')} /></div>}

              <div className="actionRow">
                <button onClick={exportEvidence}>Export HTML</button>
                <button onClick={() => save({ defaultPath: `${selected?.scenario_id || 'response'}-evidence.json`, filters: [{ name: 'JSON', extensions: ['json'] }] })}>Export JSON</button>
              </div>
            </div>
          )}

          {tab === 'validation' && (
            <div className="panel">
              <div className="rulebar">
                <b>Code-free validation</b>
                <button onClick={addRule}>+ Add rule</button>
                <button onClick={removeSelectedRules} disabled={!selectedRuleIds.length} className="rowRemove">Remove selected</button>
              </div>

              {rules.map((r, i) => (
                <div className="rule" key={r.id ?? i}>
                  <label className="checkboxRow compactCheck"><input type="checkbox" checked={selectedRuleIds.includes(r.id)} onChange={() => toggleRuleSelection(r.id)} /> </label>
                  <input value={r.target} onChange={(e) => { const x = [...rules]; x[i].target = e.target.value; setRules(x); }} />
                  <select value={r.operator} onChange={(e) => { const x = [...rules]; x[i].operator = e.target.value; setRules(x); }}>
                    {ops.map((op) => <option key={op}>{op}</option>)}
                  </select>
                  <input value={r.expected} onChange={(e) => { const x = [...rules]; x[i].expected = e.target.value; setRules(x); }} />
                  <label><input type="checkbox" checked={!!r.enabled} onChange={(e) => { const x = [...rules]; x[i].enabled = e.target.checked; setRules(x); }} /> Enabled</label>
                  <button className="rowRemove" onClick={() => removeRule(i)}>Remove</button>
                </div>
              ))}

              <div className="hint">Targets: response.status, body.status, body.data.id. Rules are evaluated natively.</div>
            </div>
          )}

          {tab === 'history' && (
            <div className="panel">
              {execs.length === 0 ? <div className="emptyState">No executions yet.</div> : execs.map((e: any) => (
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
                <div>
                  <b>Scenario attachments</b>
                  <div className="hint">Select one or more files, then remove the selected item(s).</div>
                </div>
                <div className="actionRow compact">
                  <button onClick={addAttachment}>+ Add attachment</button>
                  <button onClick={removeSelectedAttachments} disabled={!selectedAttachmentIds.length}>Remove selected</button>
                </div>
              </div>

              {attachments.length === 0 ? <div className="emptyState">No attachments yet.</div> : attachments.map((a) => (
                <div className="attachmentRow" key={a.id}>
                  <div className="attachmentMeta">
                    <label className="checkboxRow">
                      <input type="checkbox" checked={selectedAttachmentIds.includes(a.id)} onChange={() => toggleAttachmentSelection(a.id)} />
                      {a.file_name}
                    </label>
                    <small>{Math.round(a.size / 1024)} KB</small>
                  </div>
                  <textarea
                    value={a.description}
                    onChange={(e) => {
                      const x = [...attachments];
                      const idx = x.findIndex((v) => v.id === a.id);
                      if (idx >= 0) {
                        x[idx].description = e.target.value;
                        setAttachments(x);
                      }
                    }}
                    placeholder="Describe why this attachment is relevant to UAT evidence."
                  />
                  <div className="actionRow compact">
                    <button onClick={() => updateAttachment({ ...a, description: a.description })}>Save description</button>
                    <button className="rowRemove" onClick={() => removeAttachment(a.id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="comparePanel">
            <h3>Scenario Comparison</h3>
            <table className="compareTable">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Scenario Name</th>
                  <th>Expected Result</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row, idx) => (
                  <tr key={`${row.no}-${idx}`}>
                    <td>{row.no}</td>
                    <td>{row.scenario}</td>
                    <td>{row.expected}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {message && <div className="toast">{message}</div>}
        </section>
      </main>

      <footer>Local data • Native HTTP • No telemetry</footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
