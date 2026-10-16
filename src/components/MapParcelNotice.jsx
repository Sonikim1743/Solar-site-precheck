import TerrainHelpDialog from './TerrainHelpDialog.jsx'
import { MAP_PARCEL_NOTICE, MAP_PARCEL_JOIN_NOTICE } from '../utils/mapParcelSelection.js'

export const isMapParcelJoinNotice = message => message === MAP_PARCEL_JOIN_NOTICE

export default function MapParcelNotice({ message, drawing = false }) {
  return <div className="regional-parcel-instruction">
    <span>{drawing ? '作図中です。範囲を「確定」または「取消」した後、地番を選択してください。' : '地図を拡大し、表示された地番の内側を押して選択してください（ズーム16以上）。'}</span>
    <TerrainHelpDialog title="地図境界の注意" symbol="i">
      <p>{MAP_PARCEL_NOTICE} 選択境界を地図上の黄色線で確認してから適用してください。</p>
      {isMapParcelJoinNotice(message) && <p>{message}</p>}
    </TerrainHelpDialog>
  </div>
}
