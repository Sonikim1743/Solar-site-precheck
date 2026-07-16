import { useState } from 'react'
import {
  APP_VERSION,
  BUILD_DATE,
  BUILD_TARGET,
  MIN_REQUIRED_RUNTIME,
  currentBundleName,
  detectRuntimeEnvironment,
  pdfLimitMb,
} from '../utils/buildInfo.js'

const initialChecks = {
  status: 'idle',
  nedo: '未確認',
  badMesh: '未確認',
  pdfApi: '未確認',
  sw: '未確認',
}

async function statusText(fetcher, okStatus) {
  try {
    const response = await fetcher()
    if (typeof okStatus === 'function') return okStatus(response)
    return response.status === okStatus || response.ok ? 'OK' : `NG ${response.status}`
  } catch {
    return 'NG'
  }
}

function apiStatusClass(status) {
  if (status === 'success' || status === 'cached') return 'is-ok'
  if (status === 'cooldown') return 'is-warn'
  if (status === 'error') return 'is-ng'
  return ''
}

function formatCheckedAt(value) {
  if (!value) return '未確認'
  try {
    return new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '未確認'
  }
}

export default function DiagnosticPanel({ placeApiStatus = null }) {
  const [checks, setChecks] = useState(initialChecks)
  const environment = detectRuntimeEnvironment()
  const bundleName = currentBundleName()
  const addressApi = placeApiStatus || {
    status: 'idle',
    label: '待機',
    message: '地点選択時に確認します。',
    checkedAt: null,
  }

  async function runChecks() {
    setChecks((current) => ({ ...current, status: 'checking' }))
    const [nedo, badMesh, pdfApi, sw] = await Promise.all([
      statusText(() => fetch('/api/nedo-monsola?mesh=52331366', { cache: 'no-store' })),
      statusText(
        () => fetch('/api/nedo-monsola?mesh=bad', { cache: 'no-store' }),
        (response) => response.status === 400 ? 'OK' : `NG ${response.status}`,
      ),
      statusText(
        () => fetch('/api/inheritance-pdf', { method: 'GET', cache: 'no-store' }),
        (response) => response.status === 405 ? 'OK' : `NG ${response.status}`,
      ),
      serviceWorkerStatus(),
    ])
    setChecks({ status: 'done', nedo, badMesh, pdfApi, sw })
  }

  return (
    <details className="diagnostic-panel">
      <summary>
        <span>実行環境・API診断</span>
        <small>{environment} / v{APP_VERSION} / 住所API: {addressApi.label}</small>
      </summary>
      <div className="diagnostic-panel__body">
        <dl>
          <div><dt>環境</dt><dd>{environment}</dd></div>
          <div><dt>Build</dt><dd>{BUILD_DATE} / {BUILD_TARGET}</dd></div>
          <div><dt>JS</dt><dd>{bundleName}</dd></div>
          <div><dt>住所API</dt><dd className={apiStatusClass(addressApi.status)}>{addressApi.label}</dd></div>
          <div><dt>住所確認</dt><dd>{formatCheckedAt(addressApi.checkedAt)}</dd></div>
          <div><dt>住所対策</dt><dd>{addressApi.status === 'cooldown' ? '再試行抑制中' : 'キャッシュ/遅延'}</dd></div>
          <div><dt>PDF目安</dt><dd>{pdfLimitMb(environment)}MB</dd></div>
          <div><dt>Runtime</dt><dd>min {MIN_REQUIRED_RUNTIME}</dd></div>
          <div><dt>NEDO API</dt><dd className={checks.nedo === 'OK' ? 'is-ok' : 'is-ng'}>{checks.nedo}</dd></div>
          <div><dt>Bad mesh</dt><dd className={checks.badMesh === 'OK' ? 'is-ok' : 'is-ng'}>{checks.badMesh}</dd></div>
          <div><dt>PDF API</dt><dd className={checks.pdfApi === 'OK' ? 'is-ok' : 'is-ng'}>{checks.pdfApi}</dd></div>
          <div><dt>SW</dt><dd>{checks.sw}</dd></div>
        </dl>
        <button type="button" className="secondary-button" disabled={checks.status === 'checking'} onClick={runChecks}>
          {checks.status === 'checking' ? '確認中…' : 'API状態を確認'}
        </button>
        <p>{addressApi.message}</p>
        <p>Cloudflare版ではPDFサーバー解析が無い場合があります。NEDOがOKなら積雪Web取得は利用できます。</p>
      </div>
    </details>
  )
}

async function serviceWorkerStatus() {
  try {
    if (!navigator.serviceWorker?.getRegistrations) return '非対応'
    const registrations = await navigator.serviceWorker.getRegistrations()
    return registrations.length ? `${registrations.length}件` : '整理済み'
  } catch {
    return '確認失敗'
  }
}
