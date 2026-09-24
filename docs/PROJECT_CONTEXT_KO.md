# 프로젝트 목적과 결정 — 2026-09-24

## 무엇을 만드는가
일본의 태양광 후보지를 찾고, 발전량·주변 지형·적설·계통 정보를 같은 후보지 기준으로 정리하여 SolarPro와 CAD의 상세 설계 전에 검토 근거를 만드는 웹앱이다. 자동 투자 판정이나 계통 접속 승인을 대신하는 제품은 아니다.

사용자는 프로듀서 관점의 전체 흐름·정보의 쓸모·수익화 조건·화면의 간결함을 중시한다. 많은 숫자와 긴 설명을 상시 늘어놓지 않고, 지금 무엇을 확인하고 다음에 무엇을 할지 이해되게 만든다. 사용자와의 업무 보고는 한국어, 앱은 일본어다.

## 이미 정한 방향
- 주소/지도 → 후보지·필지 범위 → 참고 발전량 → 계통 확인 → 보고서의 연결을 유지한다.
- 연간 발전량은 큰 요약, 월별 값은 흐름과 표로 표시한다. 적설과 지형은 가정이 드러나는 비교 계산으로 기본값과 구분한다.
- 적설은 같은 3차 메쉬의 NEDO 자료를 확인한다. 주변 고저차의 지평선과 PVGIS 지형 계산은 중복 손실을 적용하지 않도록 구분한다.
- 주변 설비 거리나 이름 일치만으로 여유 용량·접속 가능성을 확정하지 않는다. 공개 자료의 기준일, 일치 근거, 미확인 조건을 남긴다.
- 기록 저장/읽기는 필요한 때 여는 작은 메뉴에 둔다. 보고서의 발전량 페이지는 연간·월별 값과 조건을 한 곳에 표시한다.
- GEONEX는 v1.27에서 외부 지번 확인 링크만 제공한다. API 결과 재표시·공유 키·장기 캐시·대량 수집은 도입하지 않았다. 별도 이용조건·출처·정확성 검토 후 결정한다.
- 대상 필지는 합집합, 참고 필지는 면적 제외. 그린 검토 범위가 있으면 대상 필지와 공통 부분을 사용하고, 제외 범위의 중복을 제거해 차감한다. 대상 필지가 없으면 그린 범위를 기준으로 쓴다.
- 필지 추가로 계산 지점을 옮기지 않는다. 명시적인 지점 선택 후 해당 지점의 발전량·지형을 다시 계산한다. 대표점 한 곳이 토지 전체를 대변하지는 않는다.

## 코드 구조
React/Vite, Leaflet 지도, Cloudflare Pages Functions와 로컬 Node 서버를 사용한다.

| 영역 | 파일 |
|---|---|
| 상태·후보지 전환·저장 연결 | src/App.jsx |
| 지도 조작·필지 선택 | src/components/MapPanel.jsx, ParcelReviewPanel.jsx |
| 필지 형상·면적·검증 | src/services/parcelGeometry.js, src/utils/parcelReview.js |
| 지번 XML/GeoJSON 가져오기 | src/services/cadastre.js, cadastreXml.js |
| 발전량과 비교 | shared/generation.js, generationScenario.js, src/components/GenerationPanel.jsx |
| 계통 정보 | shared/powerGrid.js, src/components/PowerGridPage.jsx |
| 기록 형식 | src/utils/reviewRecord.js |
| 보고서 | src/components/ReportPreview.jsx, ParcelReviewReport.jsx |
| 배포 묶음 | build/packageDeployment.js, docs/DEPLOYMENT_PACKAGE.md |

구체적인 v1.27 변경은 `RELEASE_v1.27_KO.md`, 공개 배포 증거는 `DEPLOYED_VERSION.md`를 읽는다. 과거 대화 전체를 이 저장소가 포함한다고 가정하지 않는다. 실제 토지 조사, CAD/SolarPro 원본, 비공개 업무 이력은 별도 비공개 인수인계 자료에 있다.
