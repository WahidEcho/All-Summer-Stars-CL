# Graph Report - swanlake-logo-audit.vjirbR  (2026-08-23)

## Corpus Check
- Corpus is ~13,624 words - fits in a single context window. You may not need a graph.

## Summary
- 13 nodes · 7 edges · 7 communities (1 shown, 6 thin omitted)
- Extraction: 0% EXTRACTED · 100% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- SwanLake Event Identity
- Move Beyond Variants
- Sports United Variants
- Event Light and Dark
- Hassan Allam Properties
- Tellr Brand
- Yalla Sahel Brand

## God Nodes (most connected - your core abstractions)
1. `SwanLake North Coast Aqua Logo` - 2 edges
2. `SwanLake North Coast Black Logo` - 2 edges
3. `SwanLake Football Stars Aqua Composition` - 2 edges
4. `SwanLake Football Stars Light Composition` - 2 edges
5. `Move Beyond Black Logo` - 1 edges
6. `Move Beyond Light Blue Logo` - 1 edges
7. `SwanLake North Coast Dark Logo` - 1 edges
8. `Sports United Light Bilingual Logo` - 1 edges
9. `Sports United Dark Bilingual Logo` - 1 edges
10. `SwanLake Football Stars Dark Composition` - 1 edges

## Surprising Connections (you probably didn't know these)
- `SwanLake Football Stars Aqua Composition` --semantically_similar_to--> `SwanLake Football Stars Light Composition`  [INFERRED] [semantically similar]
  swanlake footbal stars 21.svg → swanlake footbal stars 22.svg
- `Move Beyond Black Logo` --semantically_similar_to--> `Move Beyond Light Blue Logo`  [INFERRED] [semantically similar]
  Move Beyond Black.svg → Move Beyond light blue logo.svg
- `SwanLake North Coast Aqua Logo` --semantically_similar_to--> `SwanLake North Coast Black Logo`  [INFERRED] [semantically similar]
  SLN New Logo1.svg → SLN New Logo2.svg
- `SwanLake North Coast Black Logo` --semantically_similar_to--> `SwanLake North Coast Dark Logo`  [INFERRED] [semantically similar]
  SLN New Logo2.svg → SLN New Logo3.svg
- `Sports United Light Bilingual Logo` --semantically_similar_to--> `Sports United Dark Bilingual Logo`  [INFERRED] [semantically similar]
  SU logo1.svg → SU logo2.svg

## Hyperedges (group relationships)
- **SwanLake Football Stars Colorways** — swanlake_footbal_stars_21_logo_lockup, swanlake_footbal_stars_22_logo_composition, swanlake_footbal_stars_23_svg_artwork [INFERRED 0.95]
- **SwanLake North Coast Colorways** — sln_new_logo1_swanlake_northcoast_logo, sln_new_logo2_swanlake_northcoast_logo, sln_new_logo3_swanlake_northcoast_logo [INFERRED 0.95]

## Communities (7 total, 6 thin omitted)

### Community 0 - "SwanLake Event Identity"
Cohesion: 0.50
Nodes (4): SwanLake North Coast Aqua Logo, SwanLake North Coast Black Logo, SwanLake North Coast Dark Logo, SwanLake Football Stars Aqua Composition

## Knowledge Gaps
- **9 isolated node(s):** `Move Beyond Black Logo`, `Move Beyond Light Blue Logo`, `Hassan Allam Properties Vertical Logo Lockup`, `SwanLake North Coast Dark Logo`, `Sports United Light Bilingual Logo` (+4 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SwanLake Football Stars Aqua Composition` connect `SwanLake Event Identity` to `Event Light and Dark`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `SwanLake North Coast Aqua Logo` (e.g. with `SwanLake North Coast Black Logo` and `SwanLake Football Stars Aqua Composition`) actually correct?**
  _`SwanLake North Coast Aqua Logo` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `SwanLake North Coast Black Logo` (e.g. with `SwanLake North Coast Aqua Logo` and `SwanLake North Coast Dark Logo`) actually correct?**
  _`SwanLake North Coast Black Logo` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `SwanLake Football Stars Aqua Composition` (e.g. with `SwanLake North Coast Aqua Logo` and `SwanLake Football Stars Light Composition`) actually correct?**
  _`SwanLake Football Stars Aqua Composition` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `SwanLake Football Stars Light Composition` (e.g. with `SwanLake Football Stars Aqua Composition` and `SwanLake Football Stars Dark Composition`) actually correct?**
  _`SwanLake Football Stars Light Composition` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Move Beyond Black Logo`, `Move Beyond Light Blue Logo`, `Hassan Allam Properties Vertical Logo Lockup` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._