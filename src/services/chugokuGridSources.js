export const CHUGOKU_GRID_SOURCE_PAGE = 'https://www.energia.co.jp/nw/service/retailer/keitou/access/'

export const CHUGOKU_GRID_AREAS = Object.freeze([
  {
    id: 'hiroshima',
    label: '広島県',
    prefectures: ['広島県'],
    pdfUrl: 'https://www.energia.co.jp/nw/service/retailer/keitou/access/pdf/hiroshimakaitou.pdf',
    mappingUrl: 'https://www.energia.co.jp/nw/service/retailer/keitou/access/pdf/mapping_hiro.pdf',
    dataUrl: 'https://www.energia.co.jp/nw/service/retailer/keitou/access/zip/csv_hiro.zip',
    fallbackDataUrls: [
      'https://www.energia.co.jp/nw/service/retailer/keitou/access/csv/csv_hiro.zip',
    ],
  },
  {
    id: 'okayama',
    label: '岡山県',
    prefectures: ['岡山県'],
    pdfUrl: 'https://www.energia.co.jp/nw/service/retailer/keitou/access/pdf/okayamakaitou.pdf',
    mappingUrl: 'https://www.energia.co.jp/nw/service/retailer/keitou/access/pdf/mapping_oka.pdf',
    dataUrl: 'https://www.energia.co.jp/nw/service/retailer/keitou/access/zip/csv_oka.zip',
    fallbackDataUrls: [
      'https://www.energia.co.jp/nw/service/retailer/keitou/access/zip/csv_okayama.zip',
      'https://www.energia.co.jp/nw/service/retailer/keitou/access/csv/csv_oka.zip',
    ],
  },
  {
    id: 'shimane',
    label: '島根県',
    prefectures: ['島根県'],
    pdfUrl: 'https://www.energia.co.jp/nw/service/retailer/keitou/access/pdf/shimanekaitou.pdf',
    mappingUrl: 'https://www.energia.co.jp/nw/service/retailer/keitou/access/pdf/mapping_shima.pdf',
    dataUrl: 'https://www.energia.co.jp/nw/service/retailer/keitou/access/zip/csv_shima.zip',
    fallbackDataUrls: [
      'https://www.energia.co.jp/nw/service/retailer/keitou/access/zip/csv_shimane.zip',
      'https://www.energia.co.jp/nw/service/retailer/keitou/access/csv/csv_shima.zip',
    ],
  },
  {
    id: 'tottori',
    label: '鳥取県',
    prefectures: ['鳥取県'],
    pdfUrl: 'https://www.energia.co.jp/nw/service/retailer/keitou/access/pdf/tottorikaitou.pdf',
    mappingUrl: 'https://www.energia.co.jp/nw/service/retailer/keitou/access/pdf/mapping_tori.pdf',
    dataUrl: 'https://www.energia.co.jp/nw/service/retailer/keitou/access/zip/csv_tori.zip',
    fallbackDataUrls: [
      'https://www.energia.co.jp/nw/service/retailer/keitou/access/zip/csv_tottori.zip',
      'https://www.energia.co.jp/nw/service/retailer/keitou/access/csv/csv_tori.zip',
    ],
  },
])

export function findChugokuGridAreaByAddress(address = '') {
  const text = String(address || '')
  return CHUGOKU_GRID_AREAS.find((area) => area.prefectures.some((prefecture) => text.includes(prefecture))) || null
}

export function findChugokuGridAreaById(id) {
  return CHUGOKU_GRID_AREAS.find((area) => area.id === id) || null
}
