const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

export async function onRequestGet() {
  return new Response('Method not allowed', {
    status: 405,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      Allow: 'POST',
    },
  })
}

export async function onRequestPost() {
  return new Response(JSON.stringify({
    ok: false,
    serverParsed: false,
    unsupported: true,
    runtime: 'Cloudflare Pages Functions',
    message: [
      'Cloudflare Pages版では相続PDFのサーバー解析に対応していません。',
      'ブラウザ内解析を使用するか、Portable / Local版の /api/inheritance-pdf を使用してください。',
    ].join(' '),
  }), {
    status: 501,
    headers: JSON_HEADERS,
  })
}
