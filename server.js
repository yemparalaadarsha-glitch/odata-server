const express = require('express');
const app = express();
app.use(express.json());

const PORT = 3000;
let advances = require('./data');

const METADATA_XML = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
  <edmx:DataServices m:DataServiceVersion="1.0" m:MaxDataServiceVersion="3.0" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
    <Schema Namespace="MCALending" xmlns="http://schemas.microsoft.com/ado/2009/11/edm" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
      <EntityType Name="MCA_Advance">
        <Key>
          <PropertyRef Name="AdvanceId"/>
        </Key>
        <Property Name="AdvanceId" Type="Edm.String" Nullable="false"/>
        <Property Name="OwnerName" Type="Edm.String" Nullable="true"/>
        <Property Name="SSN" Type="Edm.String" Nullable="true"/>
        <Property Name="DriversLicense" Type="Edm.String" Nullable="true"/>
        <NavigationProperty Name="MCA_Documents" Relationship="MCALending.FK_Advance_Documents" ToRole="Documents" FromRole="Advance"/>
      </EntityType>
      <EntityType Name="MCA_Document">
        <Key>
          <PropertyRef Name="DocumentId"/>
        </Key>
        <Property Name="DocumentId" Type="Edm.String" Nullable="false"/>
        <Property Name="AdvanceId" Type="Edm.String" Nullable="true"/>
        <Property Name="DocumentType" Type="Edm.String" Nullable="true"/>
        <NavigationProperty Name="MCA_Advance" Relationship="MCALending.FK_Advance_Documents" ToRole="Advance" FromRole="Documents"/>
      </EntityType>
      <Association Name="FK_Advance_Documents">
        <End Type="MCALending.MCA_Advance" Multiplicity="1" Role="Advance"/>
        <End Type="MCALending.MCA_Document" Multiplicity="*" Role="Documents"/>
      </Association>
      <EntityContainer Name="MCALendingContainer" m:IsDefaultEntityContainer="true">
        <EntitySet Name="MCA_Advances" EntityType="MCALending.MCA_Advance"/>
        <EntitySet Name="MCA_Documents" EntityType="MCALending.MCA_Document"/>
        <AssociationSet Name="FK_Advance_Documents_Set" Association="MCALending.FK_Advance_Documents">
          <End Role="Advance" EntitySet="MCA_Advances"/>
          <End Role="Documents" EntitySet="MCA_Documents"/>
        </AssociationSet>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);

  // $metadata — use req.path to avoid Express route matching issues with $
  if (req.path === '/$metadata') {
    console.log('>> Serving $metadata');
    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'no-transform');
    return res.send(METADATA_XML);
  }

  // Parameterized entity route e.g. /MCA_Advances('ADV-001')
  const entityMatch = req.path.match(/^\/MCA_Advances\('([^']+)'\)$/);
  if (entityMatch) {
    const id = entityMatch[1];
    if (req.method === 'GET') {
      const advance = advances.find(a => a.AdvanceId === id);
      if (!advance) return res.status(404).json({ error: { message: 'Not found' } });
      return res.json({ d: advance });
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

// Service root
app.get('/', (req, res) => {
  const base = `https://${req.get('host')}/`;
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

// GET all advances
app.get('/MCA_Advances', (req, res) => {
  let results = [...advances];

  if (req.query['$filter']) {
    const match = req.query['$filter'].match(/(\w+)\s+eq\s+'([^']+)'/);
    if (match) {
      const [, field, value] = match;
      results = results.filter(r => String(r[field]) === value);
    }
  }
  if (req.query['$top']) results = results.slice(0, parseInt(req.query['$top']));
  if (req.query['$skip']) results = results.slice(parseInt(req.query['$skip']));

  res.json({ d: { results } });
});

// GET documents (navigation target — returns empty)
app.get('/MCA_Documents', (req, res) => {
  res.json({ d: { results: [] } });
});

// CREATE advance
app.post('/MCA_Advances', (req, res) => {
  const newAdvance = req.body;
  if (!newAdvance.AdvanceId) return res.status(400).json({ error: { message: 'AdvanceId is required' } });
  advances.push(newAdvance);
  res.status(201).json({ d: newAdvance });
});

app.listen(PORT, () => {
  console.log(`MCA OData server running at http://localhost:${PORT}`);
});
