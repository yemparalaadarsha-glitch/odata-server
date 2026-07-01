const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
let advances = require('./data');

const METADATA_XML = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
  <edmx:DataServices m:DataServiceVersion="1.0" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
    <Schema Namespace="MCALending" xmlns="http://schemas.microsoft.com/ado/2009/11/edm" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
      <EntityType Name="MCA_Advance">
        <Key>
          <PropertyRef Name="AdvanceId"/>
        </Key>
        <Property Name="AdvanceId" Type="Edm.String" Nullable="false" MaxLength="50" FixedLength="false" Unicode="true" />
        <Property Name="OwnerName" Type="Edm.String" Nullable="true" MaxLength="100" FixedLength="false" Unicode="true" />
        <Property Name="SSN" Type="Edm.String" Nullable="true" MaxLength="20" FixedLength="false" Unicode="true" />
        <Property Name="DriversLicense" Type="Edm.String" Nullable="true" MaxLength="50" FixedLength="false" Unicode="true" />
      </EntityType>
      <EntityContainer Name="MCALendingContainer" m:IsDefaultEntityContainer="true">
        <EntitySet Name="MCA_Advances" EntityType="MCALending.MCA_Advance"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

const baseUrl = (req) => `https://${req.get('host')}`;

const withMetadata = (req, advance) => ({
  __metadata: {
    uri: `${baseUrl(req)}/MCA_Advances('${advance.AdvanceId}')`,
    type: 'MCALending.MCA_Advance'
  },
  ...advance
});

// Middleware: handle $metadata and parameterized entity routes ($ breaks Express route matching)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);

  if (req.path === '/$metadata') {
    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'no-transform');
    return res.send(METADATA_XML);
  }

  const entityMatch = req.path.match(/^\/MCA_Advances\('([^']+)'\)$/);
  if (entityMatch) {
    const id = entityMatch[1];
    if (req.method === 'GET') {
      const advance = advances.find(a => a.AdvanceId === id);
      if (!advance) return res.status(404).json({ error: { message: 'Not found' } });
      return res.set('Cache-Control', 'no-transform').json({ d: withMetadata(req, advance) });
    }
    if (req.method === 'PATCH') {
      const index = advances.findIndex(a => a.AdvanceId === id);
      if (index === -1) return res.status(404).json({ error: { message: 'Not found' } });
      advances[index] = { ...advances[index], ...req.body };
      return res.status(204).send();
    }
    if (req.method === 'DELETE') {
      const index = advances.findIndex(a => a.AdvanceId === id);
      if (index === -1) return res.status(404).json({ error: { message: 'Not found' } });
      advances.splice(index, 1);
      return res.status(204).send();
    }
  }

  next();
});

// Service root (AtomPub service document)
app.get('/', (req, res) => {
  const base = `${baseUrl(req)}/`;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<service xml:base="${base}" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app" xmlns="http://www.w3.org/2007/app">
  <workspace>
    <atom:title>MCA Lending</atom:title>
    <collection href="MCA_Advances">
      <atom:title>MCA_Advances</atom:title>
    </collection>
  </workspace>
</service>`;
  res.set('Content-Type', 'application/atomsvc+xml');
  res.set('Cache-Control', 'no-transform');
  res.send(xml);
});

// GET record count (e.g. Salesforce sends /MCA_Advances/$count)
app.get('/MCA_Advances/\\$count', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.set('Cache-Control', 'no-transform');
  res.send(String(advances.length));
});

// GET all advances (with $filter, $top, $skip, $orderby, $select, $inlinecount support)
app.get('/MCA_Advances', (req, res) => {
  let results = [...advances];

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

  // Apply $select — only include requested fields (plus __metadata)
  const selectFields = req.query['$select'] ? req.query['$select'].split(',').map(f => f.trim()) : null;
  const mapped = results.map(a => {
    const base = withMetadata(req, a);
    if (!selectFields) return base;
    const filtered = { __metadata: base.__metadata };
    selectFields.forEach(f => { if (f in a) filtered[f] = a[f]; });
    return filtered;
  });

  const body = { results: mapped };
  // $inlinecount=allpages tells us to include the total count before $top/$skip
  if (req.query['$inlinecount'] === 'allpages') body.__count = String(totalCount);

  res.set('Cache-Control', 'no-transform');
  res.json({ d: body });
});

// CREATE advance
app.post('/MCA_Advances', (req, res) => {
  const newAdvance = req.body;
  if (!newAdvance.AdvanceId) return res.status(400).json({ error: { message: 'AdvanceId is required' } });
  advances.push(newAdvance);
  res.status(201).set('Cache-Control', 'no-transform').json({ d: withMetadata(req, newAdvance) });
});

app.listen(PORT, () => {
  console.log(`MCA OData server running on port ${PORT}`);
});
