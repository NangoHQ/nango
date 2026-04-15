// Shared tax type referenced by many EU countries (and Northern Ireland via GB).
const EU_VAT = { value: 'eu_vat', label: 'European VAT', placeholder: 'EU123456789' };

// Source of truth: country → ISO code, name, and supported tax ID types with display metadata.
// Derived from the Orb SDK table at:
// https://docs.withorb.com/api-reference/customer/update-customer#body-tax-id-one-of-0
// "Northern Ireland" has no ISO code — its eu_vat type is folded into GB.
const ORB_TAX_TABLE: { code: string; name: string; taxTypes: { value: string; label: string; placeholder: string }[] }[] = [
    { code: 'AD', name: 'Andorra', taxTypes: [{ value: 'ad_nrt', label: 'Andorra NRT', placeholder: 'A-123456-Z' }] },
    { code: 'AE', name: 'United Arab Emirates', taxTypes: [{ value: 'ae_trn', label: 'UAE TRN', placeholder: '123456789012345' }] },
    { code: 'AL', name: 'Albania', taxTypes: [{ value: 'al_tin', label: 'Albania TIN', placeholder: 'J12345678N' }] },
    { code: 'AM', name: 'Armenia', taxTypes: [{ value: 'am_tin', label: 'Armenia TIN', placeholder: '12345678' }] },
    { code: 'AO', name: 'Angola', taxTypes: [{ value: 'ao_tin', label: 'Angola TIN', placeholder: '123456789' }] },
    { code: 'AR', name: 'Argentina', taxTypes: [{ value: 'ar_cuit', label: 'Argentina CUIT', placeholder: '12-34567890-1' }] },
    { code: 'AT', name: 'Austria', taxTypes: [EU_VAT] },
    {
        code: 'AU',
        name: 'Australia',
        taxTypes: [
            { value: 'au_abn', label: 'Australia ABN', placeholder: '12 345 678 901' },
            { value: 'au_arn', label: 'Australia ARN', placeholder: '123456789012' }
        ]
    },
    { code: 'AW', name: 'Aruba', taxTypes: [{ value: 'aw_tin', label: 'Aruba TIN', placeholder: '123456789' }] },
    { code: 'AZ', name: 'Azerbaijan', taxTypes: [{ value: 'az_tin', label: 'Azerbaijan TIN', placeholder: '1234567890' }] },
    { code: 'BA', name: 'Bosnia and Herzegovina', taxTypes: [{ value: 'ba_tin', label: 'Bosnia TIN', placeholder: '123456789' }] },
    { code: 'BB', name: 'Barbados', taxTypes: [{ value: 'bb_tin', label: 'Barbados TIN', placeholder: '123456789' }] },
    { code: 'BD', name: 'Bangladesh', taxTypes: [{ value: 'bd_bin', label: 'Bangladesh BIN', placeholder: '123456789-0123' }] },
    { code: 'BE', name: 'Belgium', taxTypes: [EU_VAT] },
    { code: 'BF', name: 'Burkina Faso', taxTypes: [{ value: 'bf_ifu', label: 'Burkina Faso IFU', placeholder: '12345678901' }] },
    {
        code: 'BG',
        name: 'Bulgaria',
        taxTypes: [{ value: 'bg_uic', label: 'Bulgaria UIC', placeholder: '123456789' }, EU_VAT]
    },
    { code: 'BH', name: 'Bahrain', taxTypes: [{ value: 'bh_vat', label: 'Bahrain VAT', placeholder: '123456789012345' }] },
    { code: 'BJ', name: 'Benin', taxTypes: [{ value: 'bj_ifu', label: 'Benin IFU', placeholder: '12345678901' }] },
    { code: 'BO', name: 'Bolivia', taxTypes: [{ value: 'bo_tin', label: 'Bolivia TIN', placeholder: '1234567' }] },
    {
        code: 'BR',
        name: 'Brazil',
        taxTypes: [
            { value: 'br_cnpj', label: 'Brazil CNPJ', placeholder: '01.234.567/8901-23' },
            { value: 'br_cpf', label: 'Brazil CPF', placeholder: '123.456.789-09' }
        ]
    },
    { code: 'BS', name: 'Bahamas', taxTypes: [{ value: 'bs_tin', label: 'Bahamas TIN', placeholder: '123456789' }] },
    { code: 'BY', name: 'Belarus', taxTypes: [{ value: 'by_tin', label: 'Belarus TIN', placeholder: '123456789' }] },
    {
        code: 'CA',
        name: 'Canada',
        taxTypes: [
            { value: 'ca_bn', label: 'Canada BN', placeholder: '123456789' },
            { value: 'ca_gst_hst', label: 'Canada GST/HST', placeholder: '123456789RT0001' },
            { value: 'ca_pst_bc', label: 'Canada PST (BC)', placeholder: 'PST-1234-5678' },
            { value: 'ca_pst_mb', label: 'Canada PST (MB)', placeholder: '123456-1' },
            { value: 'ca_pst_sk', label: 'Canada PST (SK)', placeholder: '1234567' },
            { value: 'ca_qst', label: 'Canada QST', placeholder: '1234567890TQ0001' }
        ]
    },
    { code: 'CD', name: 'DR Congo', taxTypes: [{ value: 'cd_nif', label: 'DR Congo NIF', placeholder: 'A1234567B' }] },
    {
        code: 'CH',
        name: 'Switzerland',
        taxTypes: [
            { value: 'ch_uid', label: 'Switzerland UID', placeholder: 'CHE-123.456.789' },
            { value: 'ch_vat', label: 'Switzerland VAT', placeholder: 'CHE-123.456.789 MWST' }
        ]
    },
    { code: 'CL', name: 'Chile', taxTypes: [{ value: 'cl_tin', label: 'Chile TIN', placeholder: '12.345.678-K' }] },
    { code: 'CM', name: 'Cameroon', taxTypes: [{ value: 'cm_niu', label: 'Cameroon NIU', placeholder: 'M123456789' }] },
    { code: 'CN', name: 'China', taxTypes: [{ value: 'cn_tin', label: 'China TIN', placeholder: '123456789012345678' }] },
    { code: 'CO', name: 'Colombia', taxTypes: [{ value: 'co_nit', label: 'Colombia NIT', placeholder: '123.456.789-0' }] },
    { code: 'CR', name: 'Costa Rica', taxTypes: [{ value: 'cr_tin', label: 'Costa Rica TIN', placeholder: '1-234-567890' }] },
    { code: 'CV', name: 'Cape Verde', taxTypes: [{ value: 'cv_nif', label: 'Cape Verde NIF', placeholder: 'A123456789' }] },
    { code: 'CY', name: 'Cyprus', taxTypes: [EU_VAT] },
    { code: 'CZ', name: 'Czech Republic', taxTypes: [EU_VAT] },
    {
        code: 'DE',
        name: 'Germany',
        taxTypes: [{ value: 'de_stn', label: 'Germany STN', placeholder: '1234567890' }, EU_VAT]
    },
    { code: 'DK', name: 'Denmark', taxTypes: [EU_VAT] },
    { code: 'DO', name: 'Dominican Republic', taxTypes: [{ value: 'do_rcn', label: 'Dominican Republic RCN', placeholder: '1-23-45678-9' }] },
    { code: 'EC', name: 'Ecuador', taxTypes: [{ value: 'ec_ruc', label: 'Ecuador RUC', placeholder: '1234567890001' }] },
    { code: 'EE', name: 'Estonia', taxTypes: [EU_VAT] },
    { code: 'EG', name: 'Egypt', taxTypes: [{ value: 'eg_tin', label: 'Egypt TIN', placeholder: '123456789' }] },
    {
        code: 'ES',
        name: 'Spain',
        taxTypes: [{ value: 'es_cif', label: 'Spain CIF', placeholder: 'A12345678' }, EU_VAT]
    },
    { code: 'ET', name: 'Ethiopia', taxTypes: [{ value: 'et_tin', label: 'Ethiopia TIN', placeholder: '1234567890' }] },
    { code: 'EU', name: 'European Union', taxTypes: [{ value: 'eu_oss_vat', label: 'EU OSS VAT', placeholder: 'EU123456789' }] },
    { code: 'FI', name: 'Finland', taxTypes: [EU_VAT] },
    { code: 'FR', name: 'France', taxTypes: [EU_VAT] },
    {
        code: 'GB',
        name: 'United Kingdom',
        taxTypes: [
            { value: 'gb_vat', label: 'UK VAT', placeholder: 'GB123456789' },
            EU_VAT // covers Northern Ireland
        ]
    },
    { code: 'GE', name: 'Georgia', taxTypes: [{ value: 'ge_vat', label: 'Georgia VAT', placeholder: '123456789' }] },
    { code: 'GN', name: 'Guinea', taxTypes: [{ value: 'gn_nif', label: 'Guinea NIF', placeholder: '123456789' }] },
    { code: 'GR', name: 'Greece', taxTypes: [EU_VAT] },
    { code: 'HK', name: 'Hong Kong', taxTypes: [{ value: 'hk_br', label: 'Hong Kong BR', placeholder: '12345678' }] },
    {
        code: 'HR',
        name: 'Croatia',
        taxTypes: [EU_VAT, { value: 'hr_oib', label: 'Croatia OIB', placeholder: '12345678901' }]
    },
    {
        code: 'HU',
        name: 'Hungary',
        taxTypes: [EU_VAT, { value: 'hu_tin', label: 'Hungary TIN', placeholder: '12345678-1-23' }]
    },
    { code: 'ID', name: 'Indonesia', taxTypes: [{ value: 'id_npwp', label: 'Indonesia NPWP', placeholder: '12.345.678.9-012.345' }] },
    { code: 'IE', name: 'Ireland', taxTypes: [EU_VAT] },
    { code: 'IL', name: 'Israel', taxTypes: [{ value: 'il_vat', label: 'Israel VAT', placeholder: '123456789' }] },
    { code: 'IN', name: 'India', taxTypes: [{ value: 'in_gst', label: 'India GST', placeholder: '12ABCDE1234F1Z5' }] },
    { code: 'IS', name: 'Iceland', taxTypes: [{ value: 'is_vat', label: 'Iceland VAT', placeholder: '123456' }] },
    { code: 'IT', name: 'Italy', taxTypes: [EU_VAT] },
    {
        code: 'JP',
        name: 'Japan',
        taxTypes: [
            { value: 'jp_cn', label: 'Japan CN', placeholder: '1234567890123' },
            { value: 'jp_rn', label: 'Japan RN', placeholder: '12345' },
            { value: 'jp_trn', label: 'Japan TRN', placeholder: 'T1234567890123' }
        ]
    },
    { code: 'KE', name: 'Kenya', taxTypes: [{ value: 'ke_pin', label: 'Kenya PIN', placeholder: 'P123456789A' }] },
    { code: 'KG', name: 'Kyrgyzstan', taxTypes: [{ value: 'kg_tin', label: 'Kyrgyzstan TIN', placeholder: '12345678901234' }] },
    { code: 'KH', name: 'Cambodia', taxTypes: [{ value: 'kh_tin', label: 'Cambodia TIN', placeholder: 'L001-123456789' }] },
    { code: 'KR', name: 'South Korea', taxTypes: [{ value: 'kr_brn', label: 'South Korea BRN', placeholder: '123-45-67890' }] },
    { code: 'KZ', name: 'Kazakhstan', taxTypes: [{ value: 'kz_bin', label: 'Kazakhstan BIN', placeholder: '123456789012' }] },
    { code: 'LA', name: 'Laos', taxTypes: [{ value: 'la_tin', label: 'Laos TIN', placeholder: '1234567890' }] },
    {
        code: 'LI',
        name: 'Liechtenstein',
        taxTypes: [
            { value: 'li_uid', label: 'Liechtenstein UID', placeholder: 'CHE-123.456.789' },
            { value: 'li_vat', label: 'Liechtenstein VAT', placeholder: '12345' }
        ]
    },
    { code: 'LT', name: 'Lithuania', taxTypes: [EU_VAT] },
    { code: 'LU', name: 'Luxembourg', taxTypes: [EU_VAT] },
    { code: 'LV', name: 'Latvia', taxTypes: [EU_VAT] },
    { code: 'MA', name: 'Morocco', taxTypes: [{ value: 'ma_vat', label: 'Morocco VAT', placeholder: '12345678' }] },
    { code: 'MD', name: 'Moldova', taxTypes: [{ value: 'md_vat', label: 'Moldova VAT', placeholder: '1234567' }] },
    { code: 'ME', name: 'Montenegro', taxTypes: [{ value: 'me_pib', label: 'Montenegro PIB', placeholder: '12345678' }] },
    { code: 'MK', name: 'North Macedonia', taxTypes: [{ value: 'mk_vat', label: 'North Macedonia VAT', placeholder: 'MK1234567890' }] },
    { code: 'MR', name: 'Mauritania', taxTypes: [{ value: 'mr_nif', label: 'Mauritania NIF', placeholder: '12345678901' }] },
    { code: 'MT', name: 'Malta', taxTypes: [EU_VAT] },
    { code: 'MX', name: 'Mexico', taxTypes: [{ value: 'mx_rfc', label: 'Mexico RFC', placeholder: 'ABCD123456EFG' }] },
    {
        code: 'MY',
        name: 'Malaysia',
        taxTypes: [
            { value: 'my_frp', label: 'Malaysia FRP', placeholder: '12345678' },
            { value: 'my_itn', label: 'Malaysia ITN', placeholder: 'C 1234567890' },
            { value: 'my_sst', label: 'Malaysia SST', placeholder: 'A12-3456-78901234' }
        ]
    },
    { code: 'NG', name: 'Nigeria', taxTypes: [{ value: 'ng_tin', label: 'Nigeria TIN', placeholder: '12345678-0001' }] },
    { code: 'NL', name: 'Netherlands', taxTypes: [EU_VAT] },
    {
        code: 'NO',
        name: 'Norway',
        taxTypes: [
            { value: 'no_vat', label: 'Norway VAT', placeholder: '123456789MVA' },
            { value: 'no_voec', label: 'Norway VOEC', placeholder: '1234567' }
        ]
    },
    { code: 'NP', name: 'Nepal', taxTypes: [{ value: 'np_pan', label: 'Nepal PAN', placeholder: '123456789' }] },
    { code: 'NZ', name: 'New Zealand', taxTypes: [{ value: 'nz_gst', label: 'New Zealand GST', placeholder: '123456789' }] },
    { code: 'OM', name: 'Oman', taxTypes: [{ value: 'om_vat', label: 'Oman VAT', placeholder: 'OM1234567890' }] },
    { code: 'PE', name: 'Peru', taxTypes: [{ value: 'pe_ruc', label: 'Peru RUC', placeholder: '12345678901' }] },
    { code: 'PH', name: 'Philippines', taxTypes: [{ value: 'ph_tin', label: 'Philippines TIN', placeholder: '123-456-789-000' }] },
    {
        code: 'PL',
        name: 'Poland',
        taxTypes: [EU_VAT, { value: 'pl_nip', label: 'Poland NIP', placeholder: '1234567890' }]
    },
    { code: 'PT', name: 'Portugal', taxTypes: [EU_VAT] },
    {
        code: 'RO',
        name: 'Romania',
        taxTypes: [EU_VAT, { value: 'ro_tin', label: 'Romania TIN', placeholder: '1234567890' }]
    },
    { code: 'RS', name: 'Serbia', taxTypes: [{ value: 'rs_pib', label: 'Serbia PIB', placeholder: '123456789' }] },
    {
        code: 'RU',
        name: 'Russia',
        taxTypes: [
            { value: 'ru_inn', label: 'Russia INN', placeholder: '1234567890' },
            { value: 'ru_kpp', label: 'Russia KPP', placeholder: '123456789' }
        ]
    },
    { code: 'SA', name: 'Saudi Arabia', taxTypes: [{ value: 'sa_vat', label: 'Saudi Arabia VAT', placeholder: '123456789012345' }] },
    { code: 'SE', name: 'Sweden', taxTypes: [EU_VAT] },
    {
        code: 'SG',
        name: 'Singapore',
        taxTypes: [
            { value: 'sg_gst', label: 'Singapore GST', placeholder: 'M12345678X' },
            { value: 'sg_uen', label: 'Singapore UEN', placeholder: '123456789A' }
        ]
    },
    {
        code: 'SI',
        name: 'Slovenia',
        taxTypes: [EU_VAT, { value: 'si_tin', label: 'Slovenia TIN', placeholder: '12345678' }]
    },
    { code: 'SK', name: 'Slovakia', taxTypes: [EU_VAT] },
    { code: 'SN', name: 'Senegal', taxTypes: [{ value: 'sn_ninea', label: 'Senegal NINEA', placeholder: '1234567890123' }] },
    { code: 'SR', name: 'Suriname', taxTypes: [{ value: 'sr_fin', label: 'Suriname FIN', placeholder: '123456789' }] },
    { code: 'SV', name: 'El Salvador', taxTypes: [{ value: 'sv_nit', label: 'El Salvador NIT', placeholder: '1234-567890-123-4' }] },
    { code: 'TH', name: 'Thailand', taxTypes: [{ value: 'th_vat', label: 'Thailand VAT', placeholder: '1234567890123' }] },
    { code: 'TJ', name: 'Tajikistan', taxTypes: [{ value: 'tj_tin', label: 'Tajikistan TIN', placeholder: '123456789' }] },
    { code: 'TR', name: 'Turkey', taxTypes: [{ value: 'tr_tin', label: 'Turkey TIN', placeholder: '1234567890' }] },
    { code: 'TW', name: 'Taiwan', taxTypes: [{ value: 'tw_vat', label: 'Taiwan VAT', placeholder: '12345678' }] },
    { code: 'TZ', name: 'Tanzania', taxTypes: [{ value: 'tz_vat', label: 'Tanzania VAT', placeholder: '12-345678-A' }] },
    { code: 'UA', name: 'Ukraine', taxTypes: [{ value: 'ua_vat', label: 'Ukraine VAT', placeholder: '123456789' }] },
    { code: 'UG', name: 'Uganda', taxTypes: [{ value: 'ug_tin', label: 'Uganda TIN', placeholder: '1234567890A' }] },
    { code: 'US', name: 'United States', taxTypes: [{ value: 'us_ein', label: 'United States EIN', placeholder: '12-3456789' }] },
    { code: 'UY', name: 'Uruguay', taxTypes: [{ value: 'uy_ruc', label: 'Uruguay RUC', placeholder: '123456789012' }] },
    {
        code: 'UZ',
        name: 'Uzbekistan',
        taxTypes: [
            { value: 'uz_tin', label: 'Uzbekistan TIN', placeholder: '123456789' },
            { value: 'uz_vat', label: 'Uzbekistan VAT', placeholder: '123456789' }
        ]
    },
    { code: 'VE', name: 'Venezuela', taxTypes: [{ value: 've_rif', label: 'Venezuela RIF', placeholder: 'J-12345678-9' }] },
    { code: 'VN', name: 'Vietnam', taxTypes: [{ value: 'vn_tin', label: 'Vietnam TIN', placeholder: '1234567890' }] },
    { code: 'ZA', name: 'South Africa', taxTypes: [{ value: 'za_vat', label: 'South Africa VAT', placeholder: '4123456789' }] },
    { code: 'ZM', name: 'Zambia', taxTypes: [{ value: 'zm_tin', label: 'Zambia TIN', placeholder: '1234567890' }] },
    { code: 'ZW', name: 'Zimbabwe', taxTypes: [{ value: 'zw_tin', label: 'Zimbabwe TIN', placeholder: '1234567890' }] }
];

export const countryCodes: { value: string; label: string }[] = ORB_TAX_TABLE.map(({ code, name }) => ({
    value: code,
    label: name
}));

export const countryToTaxIdTypes: Record<string, string[]> = Object.fromEntries(
    ORB_TAX_TABLE.map(({ code, taxTypes }) => [code, taxTypes.map((t) => t.value)])
);

// Flatten all tax types across countries and deduplicate by value:
const allTaxTypes = ORB_TAX_TABLE.flatMap(({ taxTypes }) => taxTypes);
const uniqueTaxTypes = new Map(allTaxTypes.map((t) => [t.value, t]));
export const taxIdTypes: { value: string; label: string; placeholder: string }[] = Array.from(uniqueTaxTypes.values());
