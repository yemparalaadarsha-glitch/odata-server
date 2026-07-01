const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
let advances = require('./data');

const METADATA_XML = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
  <edmx:DataServices xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" m:DataServiceVersion="1.0" m:MaxDataServiceVersion="3.0">
    <Schema Namespace="MCALending" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns="http://schemas.microsoft.com/ado/2009/11/edm">
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
const NOW = new Date().toISOString();

const toAtomEntry = (req, adv) => {
  const base = baseUrl(req);
  return `<entry>
    <id>${base}/MCA_Advances('${adv.AdvanceId}')</id>
    <category term="MCALending.MCA_Advance" scheme="http://schemas.microsoft.com/ado/2007/08/dataservices/scheme"/>
    <link rel="edit" title="MCA_Advance" href="MCA_Advances('${adv.AdvanceId}')"/>
    <title/>
    <updated>${NOW}</updated>
    <author><name/></author>
    <content type="application/xml">
      <m:properties xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
        <d:AdvanceId>${esc(adv.AdvanceId)}</d:AdvanceId>
        <d:OwnerName>${esc(adv.OwnerName)}</d:OwnerName>
        <d:SSN>${esc(adv.SSN)}</d:SSN>
        <d:DriversLicense>${esc(adv.DriversLicense)}</d:DriversLicense>
      </m:properties>
    </content>
  </entry>`;
};

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const xmlHeaders = (res) => {
  res.set('Content-Type', 'application/atom+xml;charset=utf-8');
  res.set('Cache-Control', 'no-transform');
  res.set('DataServiceVersion', '1.0');
};

// Middleware: $metadata + parameterized entity routes
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} | query: ${JSON.stringify(req.query)}`);

  if (req.path === '/$metadata') {
    res.set('Content-Type', 'application/xml;charset=utf-8');
    res.set('Cache-Control', 'no-transform');
    res.set('DataServiceVersion', '1.0');
    return res.send(METADATA_XML);
  }

  const entityMatch = req.path.match(/^\/MCA_Advances\('([^']+)'\)$/);
  if (entityMatch && req.method === 'GET') {
    const adv = advances.find(a => a.AdvanceId === entityMatch[1]);
    if (!adv) return res.status(404).send('Not found');
    const base = baseUrl(req);
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<entry xml:base="${base}/" xmlns="http://www.w3.org/2005/Atom" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
  <id>${base}/MCA_Advances('${adv.AdvanceId}')</id>
  <category term="MCALending.MCA_Advance" scheme="http://schemas.microsoft.com/ado/2007/08/dataservices/scheme"/>
  <link rel="edit" title="MCA_Advance" href="MCA_Advances('${adv.AdvanceId}')"/>
  <title/>
  <updated>${NOW}</updated>
  <author><name/></author>
  <content type="application/xml">
    <m:properties>
      <d:AdvanceId>${esc(adv.AdvanceId)}</d:AdvanceId>
      <d:OwnerName>${esc(adv.OwnerName)}</d:OwnerName>
      <d:SSN>${esc(adv.SSN)}</d:SSN>
      <d:DriversLicense>${esc(adv.DriversLicense)}</d:DriversLicense>
    </m:properties>
  </content>
</entry>`;
    xmlHeaders(res);
    return res.send(xml);
  }

  next();
});

// Service root
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
  res.set('Content-Type', 'application/atomsvc+xml;charset=utf-8');
  res.set('Cache-Control', 'no-transform');
  res.set('DataServiceVersion', '1.0');
  res.send(xml);
});

// GET count
app.get('/MCA_Advances/\\$count', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.set('DataServiceVersion', '1.0');
  res.send(String(advances.length));
});

// GET all advances — returns Atom XML feed
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

  const base = baseUrl(req);
  const countTag = (req.query['$inlinecount'] === 'allpages')
    ? `\n  <m:count>${totalCount}</m:count>` : '';

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xml:base="${base}/" xmlns="http://www.w3.org/2005/Atom" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
  <title type="text">MCA_Advances</title>
  <id>${base}/MCA_Advances</id>
  <updated>${NOW}</updated>
  <link rel="self" title="MCA_Advances" href="MCA_Advances"/>${countTag}
  ${results.map(a => toAtomEntry(req, a)).join('\n  ')}
</feed>`;

  xmlHeaders(res);
  res.send(xml);
});

app.listen(PORT, () => {
  console.log(`MCA OData server (AtomPub) running on port ${PORT}`);
});
