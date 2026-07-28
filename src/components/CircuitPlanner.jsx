import { useMemo, useState } from 'react'
import {
  MODULE_PRESETS,
  PCS_PRESETS,
  calculateCircuitPlan,
} from '../utils/circuitPlanner.js'

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-'
}

function findPreset(presets, id) {
  return presets.find((item) => item.id === id) || presets[0]
}

export default function CircuitPlanner() {
  const [pcsId, setPcsId] = useState(PCS_PRESETS[0].id)
  const [moduleId, setModuleId] = useState(MODULE_PRESETS[0].id)
  const [pcsCount, setPcsCount] = useState(4)
  const [moduleCount, setModuleCount] = useState(528)
  const selectedPcs = findPreset(PCS_PRESETS, pcsId)
  const selectedModule = findPreset(MODULE_PRESETS, moduleId)

  const plan = useMemo(() => calculateCircuitPlan({
    pcsCount,
    pcsCapacityKw: selectedPcs.capacityKw,
    maxParallelPerPcs: selectedPcs.defaultParallelPerPcs,
    moduleCount,
    modulePowerW: selectedModule.powerW,
    seriesSearchLimit: selectedModule.seriesSearchLimit,
  }), [pcsCount, moduleCount, selectedModule.seriesSearchLimit, selectedModule.powerW, selectedPcs.capacityKw, selectedPcs.defaultParallelPerPcs])

  return (
    <article className="knowledge-card knowledge-card--wide circuit-planner">
      <div className="circuit-planner__header">
        <div>
          <span className="knowledge-card__label">電気回路構成</span>
          <div className="circuit-planner__title-row">
            <h3>PCS・モジュール結線アシスト</h3>
            <span
              className="help-tooltip help-tooltip--below circuit-entry-help"
              tabIndex="0"
              aria-label="Solar Pro上部メニューのI-Vカーブから電気回路構成を開き、この入力アシストの値を転記します。"
            >
              ?
              <span className="help-tooltip__body circuit-entry-help__body" role="tooltip">
                <strong>Solar Proで開く場所</strong>
                <span>I-Vカーブ → 電気回路構成 を開き、このアシスト結果を入力します。</span>
                <img src="/screenshots/solarpro-circuit-menu-entry.png" alt="Solar Pro I-Vカーブメニューから電気回路構成を開く画面" />
              </span>
            </span>
          </div>
          <p>Solar Proの「PCS台数 × 最大並列数 × 最大直列数」が、設置モジュール枚数以上になる最小構成を提案します。</p>
        </div>
        <div className={plan.isEnough ? 'circuit-status circuit-status--ok' : 'circuit-status circuit-status--warn'}>
          <strong>{plan.maxCircuitModules.toLocaleString()} 枚</strong>
          <span>PV {formatNumber(plan.dcCapacityKw, 2)} kW</span>
        </div>
      </div>

      <div className="circuit-planner__grid circuit-planner__grid--simple">
        <label>
          <span>PCS型式</span>
          <select value={pcsId} onChange={(event) => setPcsId(event.target.value)}>
            {PCS_PRESETS.map((pcs) => (
              <option key={pcs.id} value={pcs.id}>{pcs.model}</option>
            ))}
          </select>
          <small>{selectedPcs.note}</small>
        </label>
        <label>
          <span>PCS台数</span>
          <input type="number" min="1" value={pcsCount} onChange={(event) => setPcsCount(event.target.value)} />
          <small>Solar Proに入力するPCS台数。</small>
        </label>
        <label>
          <span>モジュール型式</span>
          <select value={moduleId} onChange={(event) => setModuleId(event.target.value)}>
            {MODULE_PRESETS.map((module) => (
              <option key={module.id} value={module.id}>{module.model}</option>
            ))}
          </select>
          <small>{selectedModule.powerW} W / 枚</small>
        </label>
        <label>
          <span>設置モジュール枚数</span>
          <input type="number" min="0" value={moduleCount} onChange={(event) => setModuleCount(event.target.value)} />
          <small>3DCADで配置した実モジュール枚数。</small>
        </label>
      </div>

      <div className="circuit-formula">
        <span>Solar Pro入力</span>
        <div className="circuit-formula__body">
          <strong>
            PCS {plan.pcsCount}台 × 最大並列 {plan.maxParallelPerPcs} × 最大直列 {plan.seriesCount}
            <em>= {plan.maxCircuitModules.toLocaleString()} 枚枠</em>
          </strong>
          <small>
            PV設備容量 {formatNumber(plan.dcCapacityKw, 2)} kW / PCS比率{' '}
            <span className={plan.dcAcRatio <= 110 ? 'circuit-ratio circuit-ratio--low' : 'circuit-ratio'}>
              {formatNumber(plan.dcAcRatio, 1)}%
            </span>
          </small>
        </div>
      </div>

      <details className="circuit-guide">
        <summary>
          <span>Solar Proでの確認手順</span>
          <em>開く / 閉じる</em>
        </summary>
        <div className="circuit-guide__body">
          <section>
            <h4>1. 電気回路構成で結線結果を確認</h4>
            <ol>
              <li>PCS台数を入力し、最大並列数・最大直列数をこのアシスト結果に合わせる。</li>
              <li><strong>全アレイ自動結線</strong> を押して、Solar Pro側で結線を作成する。</li>
              <li><strong>システム診断</strong> のPV設備容量・PCS設備容量に対する割合を確認する。</li>
              <li>左下の <strong>設置モジュール枚数</strong> と <strong>実モジュール枚数</strong> が一致しているか確認する。</li>
            </ol>
          </section>
          <section>
            <h4>2. PCS詳細設定の入れ方</h4>
            <ol>
              <li>PCS台数を入力し、PCS設定は <strong>詳細設定</strong> を選択する。</li>
              <li><strong>PCS詳細設定...</strong> を開き、一覧画面で <strong>全選択</strong> を押す。</li>
              <li><strong>設定...</strong> からパワーコンディショナーを選択する。</li>
              <li>メーカー名は <strong>ファーウェイ・ジャパン</strong>、型式は図面・仕様書と同じPCSを選択する。</li>
            </ol>
          </section>
          <div className="circuit-guide__images" aria-label="Solar Pro PCS設定画面例">
            <figure>
              <span className="circuit-guide__image-wrap">
                <img src="/screenshots/solarpro-circuit-composition.png" alt="Solar Pro 電気回路構成画面" />
                <span className="circuit-guide__hotspot circuit-guide__hotspot--composition-pcs">PCS台数</span>
                <span className="circuit-guide__hotspot circuit-guide__hotspot--composition-series">最大直列</span>
                <span className="circuit-guide__hotspot circuit-guide__hotspot--blue circuit-guide__hotspot--composition-auto">自動結線</span>
              </span>
              <figcaption>電気回路構成：自動結線後に容量・枚数を確認</figcaption>
            </figure>
            <figure>
              <span className="circuit-guide__image-wrap">
                <img src="/screenshots/solarpro-pcs-detail-list.png" alt="Solar Pro PCS詳細設定一覧" />
                <span className="circuit-guide__callout circuit-guide__callout--pcs-list-all">1 全選択</span>
                <span className="circuit-guide__arrow circuit-guide__arrow--pcs-list-all">↘</span>
                <span className="circuit-guide__callout circuit-guide__callout--pcs-list-setting">2 設定</span>
                <span className="circuit-guide__arrow circuit-guide__arrow--pcs-list-setting">↙</span>
              </span>
              <figcaption>PCS詳細設定一覧：全選択して設定へ進む</figcaption>
            </figure>
            <figure>
              <span className="circuit-guide__image-wrap">
                <img src="/screenshots/solarpro-pcs-detail-setting.png" alt="Solar Pro PCS詳細設定画面" />
                <span className="circuit-guide__callout circuit-guide__callout--pcs-setting-select">メーカー・型式を選択</span>
                <span className="circuit-guide__arrow circuit-guide__arrow--pcs-setting-select">↓</span>
                <span className="circuit-guide__hotspot circuit-guide__hotspot--pcs-setting-ok">OK</span>
              </span>
              <figcaption>PCS詳細設定：メーカーと型式を図面条件に合わせる</figcaption>
            </figure>
          </div>
        </div>
      </details>

      {!plan.isEnough && (
        <p className="inline-message inline-message--error">
          現在のPCS台数・入力ポート数では設置モジュール枚数に届きません。PCS台数を増やすか、構成を見直してください。
        </p>
      )}
    </article>
  )
}
