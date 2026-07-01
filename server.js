const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
let { files, accounts } = require('./data');

const METADATA_XML = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
  <edmx:DataServices xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" m:DataServiceVersion="1.0" m:MaxDataServiceVersion="3.0">
    <Schema Namespace="FileData" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns="http://schemas.microsoft.com/ado/2009/11/edm">
      <EntityType Name="File">
        <Key><PropertyRef Name="FileID"/></Key>
        <Property Name="FileID"                Type="Edm.String"  Nullable="false" MaxLength="50"  FixedLength="false" Unicode="true" />
        <Property Name="Name"                  Type="Edm.String"  Nullable="true"  MaxLength="100" FixedLength="false" Unicode="true" />
        <Property Name="EstimatedDebtAmount"   Type="Edm.Decimal" Nullable="true"  Precision="12"  Scale="2" />
        <Property Name="FirstDraftDate"        Type="Edm.DateTime" Nullable="true" />
        <Property Name="CurrentWeeklyPayment"  Type="Edm.Decimal" Nullable="true"  Precision="10"  Scale="2" />
      </EntityType>
      <EntityType Name="Account">
        <Key><PropertyRef Name="AccountID"/></Key>
        <Property Name="AccountID"      Type="Edm.String" Nullable="false" MaxLength="50"  FixedLength="false" Unicode="true" />
        <Property Name="Name"           Type="Edm.String" Nullable="true"  MaxLength="100" FixedLength="false" Unicode="true" />
        <Property Name="SSN"            Type="Edm.String" Nullable="true"  MaxLength="20"  FixedLength="false" Unicode="true" />
        <Property Name="DriversLicense" Type="Edm.String" Nullable="true"  MaxLength="50"  FixedLength="false" Unicode="true" />
      </EntityType>
      <EntityContainer Name="FileDataContainer" m:IsDefaultEntityContainer="true">
        <EntitySet Name="Files"    EntityType="FileData.File"/>
        <EntitySet Name="Accounts" EntityType="FileData.Account"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

const baseUrl = (req) => `https://${req.get('host')}`;
const NOW = new Date().toISOString();

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fileEntry = (req, f) => {
  const base = baseUrl(req);
  return `<entry>
    <id>${base}/Files('${f.FileID}')</id>
    <category term="FileData.File" scheme="http://schemas.microsoft.com/ado/2007/08/dataservices/scheme"/>
    <link rel="edit" title="File" href="Files('${f.FileID}')"/>
    <title/><updated>${NOW}</updated><author><name/></author>
    <content type="application/xml">
      <m:properties xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
        <d:FileID>${esc(f.FileID)}</d:FileID>
        <d:Name>${esc(f.Name)}</d:Name>
        <d:EstimatedDebtAmount m:type="Edm.Decimal">${f.EstimatedDebtAmount ?? ''}</d:EstimatedDebtAmount>
        <d:FirstDraftDate m:type="Edm.DateTime">${f.FirstDraftDate ?? ''}</d:FirstDraftDate>
        <d:CurrentWeeklyPayment m:type="Edm.Decimal">${f.CurrentWeeklyPayment ?? ''}</d:CurrentWeeklyPayment>
      </m:properties>
    </content>
  </entry>`;
};

const accountEntry = (req, a) => {
  const base = baseUrl(req);
  return `<entry>
    <id>${base}/Accounts('${a.AccountID}')</id>
    <category term="FileData.Account" scheme="http://schemas.microsoft.com/ado/2007/08/dataservices/scheme"/>
    <link rel="edit" title="Account" href="Accounts('${a.AccountID}')"/>
    <title/><updated>${NOW}</updated><author><name/></author>
    <content type="application/xml">
      <m:properties xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
        <d:AccountID>${esc(a.AccountID)}</d:AccountID>
        <d:Name>${esc(a.Name)}</d:Name>
        <d:SSN>${esc(a.SSN)}</d:SSN>
        <d:DriversLicense>${esc(a.DriversLicense)}</d:DriversLicense>
      </m:properties>
    </content>
  </entry>`;
};

const xmlHeaders = (res) => {
  res.set('Content-Type', 'application/atom+xml;charset=utf-8');
  res.set('Cache-Control', 'no-transform');
  res.set('DataServiceVersion', '1.0');
};

const atomFeed = (req, entitySet, entries, totalCount, showCount) => {
  const base = baseUrl(req);
  const countTag = showCount ? `\n  <m:count>${totalCount}</m:count>` : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xml:base="${base}/" xmlns="http://www.w3.org/2005/Atom" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
  <title type="text">${entitySet}</title>
  <id>${base}/${entitySet}</id>
  <updated>${NOW}</updated>
  <link rel="self" title="${entitySet}" href="${entitySet}"/>${countTag}
  ${entries.join('\n  ')}
</feed>`;
};

const applyODataParams = (arr, q) => {
  let results = [...arr];
  if (q['$filter']) {
    const m = q['$filter'].match(/(\w+)\s+eq\s+'([^']+)'/);
    if (m) results = results.filter(r => String(r[m[1]]) === m[2]);
  }
  if (q['$orderby']) {
    const [field, dir] = q['$orderby'].split(/\s+/);
    results.sort((a, b) => {
      const cmp = String(a[field] ?? '').localeCompare(String(b[field] ?? ''));
      return dir === 'desc' ? -cmp : cmp;
    });
  }
  const total = results.length;
  if (q['$skip']) results = results.slice(parseInt(q['$skip']));
  if (q['$top'])  results = results.slice(0, parseInt(q['$top']));
  return { results, total };
};

// ── Middleware: $metadata + parameterized routes ──────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} | ${JSON.stringify(req.query)}`);

  if (req.path === '/$metadata') {
    res.set('Content-Type', 'application/xml;charset=utf-8');
    res.set('Cache-Control', 'no-transform');
    res.set('DataServiceVersion', '1.0');
    return res.send(METADATA_XML);
  }

  // Files('FILE-001')
  const fileMatch = req.path.match(/^\/Files\('([^']+)'\)$/);
  if (fileMatch) {
    const id = fileMatch[1];
    const i = files.findIndex(f => f.FileID === id);
    if (req.method === 'GET') {
      if (i === -1) return res.status(404).send('Not found');
      xmlHeaders(res);
      return res.send(`<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">${fileEntry(req, files[i])}</feed>`);
    }
    if (req.method === 'PATCH' || req.method === 'PUT') {
      if (i === -1) return res.status(404).send();
      files[i] = { ...files[i], ...req.body };
      return res.status(204).send();
    }
    if (req.method === 'DELETE') {
      if (i === -1) return res.status(404).send();
      files.splice(i, 1);
      return res.status(204).send();
    }
  }

  // Accounts('ACC-001')
  const accMatch = req.path.match(/^\/Accounts\('([^']+)'\)$/);
  if (accMatch) {
    const id = accMatch[1];
    const i = accounts.findIndex(a => a.AccountID === id);
    if (req.method === 'GET') {
      if (i === -1) return res.status(404).send('Not found');
      xmlHeaders(res);
      return res.send(`<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">${accountEntry(req, accounts[i])}</feed>`);
    }
    if (req.method === 'PATCH' || req.method === 'PUT') {
      if (i === -1) return res.status(404).send();
      accounts[i] = { ...accounts[i], ...req.body };
      return res.status(204).send();
    }
    if (req.method === 'DELETE') {
      if (i === -1) return res.status(404).send();
      accounts.splice(i, 1);
      return res.status(204).send();
    }
  }

  next();
});

// ── Admin UI ──────────────────────────────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// JSON API for admin UI
app.get('/api/files',    (req, res) => res.json(files));
app.post('/api/files',   (req, res) => { if (!req.body.FileID) return res.status(400).json({ error: 'FileID required' }); files.push(req.body); res.status(201).json(req.body); });
app.patch('/api/files/:id', (req, res) => { const i = files.findIndex(f => f.FileID === req.params.id); if (i === -1) return res.status(404).send(); files[i] = { ...files[i], ...req.body }; res.json(files[i]); });
app.delete('/api/files/:id', (req, res) => { const i = files.findIndex(f => f.FileID === req.params.id); if (i === -1) return res.status(404).send(); files.splice(i, 1); res.status(204).send(); });

app.get('/api/accounts',    (req, res) => res.json(accounts));
app.post('/api/accounts',   (req, res) => { if (!req.body.AccountID) return res.status(400).json({ error: 'AccountID required' }); accounts.push(req.body); res.status(201).json(req.body); });
app.patch('/api/accounts/:id', (req, res) => { const i = accounts.findIndex(a => a.AccountID === req.params.id); if (i === -1) return res.status(404).send(); accounts[i] = { ...accounts[i], ...req.body }; res.json(accounts[i]); });
app.delete('/api/accounts/:id', (req, res) => { const i = accounts.findIndex(a => a.AccountID === req.params.id); if (i === -1) return res.status(404).send(); accounts.splice(i, 1); res.status(204).send(); });

// ── OData service root ────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const base = `${baseUrl(req)}/`;
  res.set('Content-Type', 'application/atomsvc+xml;charset=utf-8');
  res.set('Cache-Control', 'no-transform');
  res.set('DataServiceVersion', '1.0');
  res.send(`<?xml version="1.0" encoding="utf-8"?>
<service xml:base="${base}" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app" xmlns="http://www.w3.org/2007/app">
  <workspace>
    <atom:title>File Data</atom:title>
    <collection href="Files"><atom:title>Files</atom:title></collection>
    <collection href="Accounts"><atom:title>Accounts</atom:title></collection>
  </workspace>
</service>`);
});

// ── OData entity set routes ───────────────────────────────────────────────────
app.get('/Files/\\$count',    (req, res) => res.set('Content-Type','text/plain').send(String(files.length)));
app.get('/Accounts/\\$count', (req, res) => res.set('Content-Type','text/plain').send(String(accounts.length)));

app.get('/Files', (req, res) => {
  const { results, total } = applyODataParams(files, req.query);
  xmlHeaders(res);
  res.send(atomFeed(req, 'Files', results.map(f => fileEntry(req, f)), total, req.query['$inlinecount'] === 'allpages'));
});

app.get('/Accounts', (req, res) => {
  const { results, total } = applyODataParams(accounts, req.query);
  xmlHeaders(res);
  res.send(atomFeed(req, 'Accounts', results.map(a => accountEntry(req, a)), total, req.query['$inlinecount'] === 'allpages'));
});

// POST (create)
app.post('/Files', (req, res) => {
  if (!req.body.FileID) return res.status(400).send();
  files.push(req.body);
  xmlHeaders(res);
  res.status(201).send(fileEntry(req, req.body));
});

app.post('/Accounts', (req, res) => {
  if (!req.body.AccountID) return res.status(400).send();
  accounts.push(req.body);
  xmlHeaders(res);
  res.status(201).send(accountEntry(req, req.body));
});

app.listen(PORT, () => console.log(`OData server running on port ${PORT}`));
