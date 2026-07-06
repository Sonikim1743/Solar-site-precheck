export async function onRequestGet({ request }) {
  const url = new URL(request.url)
  const mesh = url.searchParams.get('mesh') || ''

  if (!/^\d{8}$/.test(mesh)) {
    return new Response('Invalid mesh code', {
      status: 400,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(`https://domessolar.infop.nedo.go.jp/appww/cgi-bin/monsola.cgi?m=${mesh}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Solar-Site-Precheck/1.1 (+Cloudflare Pages Function)',
      },
    })
    clearTimeout(timeout)

    if (!response.ok) {
      return new Response(`NEDO HTTP ${response.status}`, {
        status: 502,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      })
    }

    return new Response(await response.text(), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return new Response(error?.name === 'AbortError' ? 'NEDO request timeout' : (error?.message || 'NEDO request failed'), {
      status: 502,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  }
}
