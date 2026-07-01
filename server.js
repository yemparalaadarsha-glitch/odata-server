const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
let records = require('./data');

const METADATA_XML = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
  <edmx:DataServices xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" m:DataServiceVersion="1.0" m:MaxDataServiceVersion="3.0">
    <Schema Namespace="PublicData" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns="http://schemas.microsoft.com/ado/2009/11/edm">
      <EntityType Name="PublicRecord">
        <Key>
          <PropertyRef Name="UserId"/>
        </Key>
        <Property Name="UserId" Type="Edm.String" Nullable="false" MaxLength="50" FixedLength="false" Unicode="true" />
        <Property Name="OwnerName" Type="Edm.String" Nullable="true" MaxLength="100" FixedLength="false" Unicode="true" />
        <Property Name="SSN" Type="Edm.String" Nullable="true" MaxLength="20" FixedLength="false" Unicode="true" />
        <Property Name="DriversLicense" Type="Edm.String" Nullable="true" MaxLength="50" FixedLength="false" Unicode="true" />
      </EntityType>
      <EntityContainer Name="PublicDataContainer" m:IsDefaultEntityContainer="true">
        <EntitySet Name="PublicRecords" EntityType="PublicData.PublicRecord"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

const baseUrl = (req) => `https://${req.get('host')}`;
const NOW = new Date().toISOString();

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const toAtomEntry = (req, rec) => {
  const base = baseUrl(req);
  return `<entry>
    <id>${base}/PublicRecords('${rec.UserId}')</id>
    <category term="PublicData.PublicRecord" scheme="http://schemas.microsoft.com/ado/2007/08/dataservices/scheme"/>
    <link rel="edit" title="PublicRecord" href="PublicRecords('${rec.UserId}')"/>
    <title/>
    <updated>${NOW}</updated>
    <author><name/></author>
    <content type="application/xml">
      <m:properties xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
        <d:UserId>${esc(rec.UserId)}</d:UserId>
        <d:OwnerName>${esc(rec.OwnerName)}</d:OwnerName>
        <d:SSN>${esc(rec.SSN)}</d:SSN>
        <d:DriversLicense>${esc(rec.DriversLicense)}</d:DriversLicense>
      </m:properties>
    </content>
  </entry>`;
};

const xmlHeaders = (res) => {
  res.set('Content-Type', 'application/atom+xml;charset=utf-8');
  res.set('Cache-Control', 'no-transform');
  res.set('DataServiceVersion', '1.0');
};

// Middleware: $metadata + parameterized entity routes
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} | query: ${JSON.stringify(req.query)}`);

  const interestingHeaders = ['accept', 'dataserviceversion', 'maxdataserviceversion', 'user-agent'];
  const hdrs = Object.fromEntries(interestingHeaders.filter(h => req.headers[h]).map(h => [h, req.headers[h]]));
  if (Object.keys(hdrs).length) console.log(`  headers: ${JSON.stringify(hdrs)}`);

  if (req.path === '/$metadata') {
    res.set('Content-Type', 'application/xml;charset=utf-8');
    res.set('Cache-Control', 'no-transform');
    res.set('DataServiceVersion', '1.0');
    return res.send(METADATA_XML);
  }

  const entityMatch = req.path.match(/^\/PublicRecords\('([^']+)'\)$/);
  if (entityMatch) {
    const id = entityMatch[1];
    const index = records.findIndex(r => r.UserId === id);

    if (req.method === 'GET') {
      if (index === -1) return res.status(404).send('Not found');
      const rec = records[index];
      const base = baseUrl(req);
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<entry xml:base="${base}/" xmlns="http://www.w3.org/2005/Atom" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
  <id>${base}/PublicRecords('${rec.UserId}')</id>
  <category term="PublicData.PublicRecord" scheme="http://schemas.microsoft.com/ado/2007/08/dataservices/scheme"/>
  <link rel="edit" title="PublicRecord" href="PublicRecords('${rec.UserId}')"/>
  <title/>
  <updated>${NOW}</updated>
  <author><name/></author>
  <content type="application/xml">
    <m:properties>
      <d:UserId>${esc(rec.UserId)}</d:UserId>
      <d:OwnerName>${esc(rec.OwnerName)}</d:OwnerName>
      <d:SSN>${esc(rec.SSN)}</d:SSN>
      <d:DriversLicense>${esc(rec.DriversLicense)}</d:DriversLicense>
    </m:properties>
  </content>
</entry>`;
      xmlHeaders(res);
      return res.send(xml);
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      if (index === -1) return res.status(404).json({ error: 'Not found' });
      records[index] = { ...records[index], ...req.body };
      return res.status(204).send();
    }

    if (req.method === 'DELETE') {
      if (index === -1) return res.status(404).json({ error: 'Not found' });
      records.splice(index, 1);
      return res.status(204).send();
    }
  }

  next();
});

// Admin UI
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// JSON API for admin UI
app.get('/api/records', (req, res) => res.json(records));
app.post('/api/records', (req, res) => {
  const rec = req.body;
  if (!rec.UserId) return res.status(400).json({ error: 'UserId required' });
  records.push(rec);
  res.status(201).json(rec);
});
app.patch('/api/records/:id', (req, res) => {
  const i = records.findIndex(r => r.UserId === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Not found' });
  records[i] = { ...records[i], ...req.body };
  res.json(records[i]);
});
app.delete('/api/records/:id', (req, res) => {
  const i = records.findIndex(r => r.UserId === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Not found' });
  records.splice(i, 1);
  res.status(204).send();
});

// Service root
app.get('/', (req, res) => {
  const base = `${baseUrl(req)}/`;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<service xml:base="${base}" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app" xmlns="http://www.w3.org/2007/app">
  <workspace>
    <atom:title>Public Records</atom:title>
    <collection href="PublicRecords">
      <atom:title>PublicRecords</atom:title>
    </collection>
  </workspace>
</service>`;
  res.set('Content-Type', 'application/atomsvc+xml;charset=utf-8');
  res.set('Cache-Control', 'no-transform');
  res.set('DataServiceVersion', '1.0');
  res.send(xml);
});

// GET count
app.get('/PublicRecords/\\$count', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.set('DataServiceVersion', '1.0');
  res.send(String(records.length));
});

// GET all records — Atom XML feed
app.get('/PublicRecords', (req, res) => {
  let results = [...records];

  if (req.query['$filter']) {
    const match = req.query['$filter'].match(/(\w+)\s+eq\s+'([^']+)'/);
    if (match) {
      const [, field, value] = match;
      results = results.filter(r => String(r[field]) === value);
    }
  }

  if (req.query['$orderby']) {
    const [field, dir] = req.query['$orderby'].split(/\s+/);
    results.sort((a, b) => {
      const cmp = String(a[field] ?? '').localeCompare(String(b[field] ?? ''));
      return dir === 'desc' ? -cmp : cmp;
    });
  }

  const totalCount = results.length;
  if (req.query['$skip']) results = results.slice(parseInt(req.query['$skip']));
  if (req.query['$top']) results = results.slice(0, parseInt(req.query['$top']));

  const base = baseUrl(req);
  const countTag = req.query['$inlinecount'] === 'allpages'
    ? `\n  <m:count>${totalCount}</m:count>` : '';

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xml:base="${base}/" xmlns="http://www.w3.org/2005/Atom" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
  <title type="text">PublicRecords</title>
  <id>${base}/PublicRecords</id>
  <updated>${NOW}</updated>
  <link rel="self" title="PublicRecords" href="PublicRecords"/>${countTag}
  ${results.map(r => toAtomEntry(req, r)).join('\n  ')}
</feed>`;

  xmlHeaders(res);
  res.send(xml);
});

app.listen(PORT, () => {
  console.log(`Public Records OData server running on port ${PORT}`);
});
