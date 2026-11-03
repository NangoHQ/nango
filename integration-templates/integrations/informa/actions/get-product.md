<!-- BEGIN GENERATED CONTENT -->
# Get Product

## General Information

- **Description:** Fetches an Informa EMPRESAS product by CIF (packaged reports or modular products). Does not fall back to another product if the request fails.
- **Version:** 1.0.0
- **Group:** Products
- **Endpoint:** `GET /product`
- **Input:** (`GetProductInput`)
- **Output:** (`GetProductOutput`)

- **Code:** [github.com](https://github.com/NangoHQ/integration-templates/tree/main/integrations/informa/actions/get-product.ts)

## Documentation

### Description

Calls Informa `GET /api/get-product` with the requested product code and CIF. Prefer `formato=json`. Large PDF responses may exceed the action output limit; use the proxy for binary downloads when needed.

### Common products

- `INFORME_FINANCIERO`, `INFORME_COMERCIAL`, `INFORME_ABREVIADO`, `INFORME_MAYOR`
- Modular: `FICHA`, `EVALUACION_CREDITO`, `BALANCES`, `ADMINISTRADORES`, …

### Input

| Field | Type | Required | Description |
| - | - | - | - |
| product | string | Yes | Informa product code |
| cif | string | Yes | NIF/CIF |
| formato | `json` \| `pdf` | No | Default `json` |
| rai | boolean | No | RAI module when contracted |
| morosidad | boolean | No | Delinquency modules when contracted |
