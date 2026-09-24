# 공개 배포 상태

**v1.27.1 현재 검증 중.** 아래는 2026-09-24 14:07~14:09 JST에 실제 확인한 **v1.27 운영 상태**다. v1.27.1의 게시 완료나 GitHub CI 성공을 나타내지 않는다.

## 확인된 v1.27 운영 상태

- 공개 URL: https://solar-site-precheck.pages.dev/
- Cloudflare 프로젝트: `solar-site-precheck` / 환경: `Production` / 브랜치: `main`
- 배포 ID: `69ea5bef-3ac3-4897-9aa1-2c9eeaa66a35`
- 배포별 URL: https://69ea5bef.solar-site-precheck.pages.dev/
- 앱 버전: **1.27** / 빌드일: **2026-09-24** / 대상: **cloudflare**
- main JS: `index-1VWw4kON.js`
- 배포 패키지 소스 커밋: `f6fb2e245a4955f7171f7b864f950fa8eaffa616`
- 확인 시점 GitHub `main`: `c794c89eb8a174ebddfdf8e3d7426c6fefdc1408`

기존 계정의 공식 Wrangler 배포 목록에서 위 ID와 Production / main / Source `f6fb2e2`를 확인했다. GitHub 원격 조회도 위 `main` 커밋과 일치했다. 배포 파일을 만든 소스 커밋과 배포 패키지·기록을 포함한 GitHub 커밋은 구분한다.

운영 HTML, main JS, PWA `manifest.json`은 모두 HTTP 200이며 로컬 Cloudflare 패키지의 SHA-256과 일치했다. main JS의 SHA-256은 `7d6434288935872ca10813ba96680589d9ef5bdbea037a35717781bc09b3640c`다. 패키지 루트의 `release-manifest.json`은 로컬 검증 자료이고, 공개 사이트의 PWA `manifest.json`과 다른 파일이다.

`/api/pv-generation?invalid=1`은 JSON 오류와 HTTP 400을 반환했다. 공개 시험좌표 34.9, 133.5에서 DC 50 kW, 손실 14%, 경사 20°, 남향 0°로 실제 발전량 API를 조회했을 때 HTTP 200, 연간 **66,151.04 kWh**, 12개월 결과를 반환했다. 출처는 **PVGIS 5.3 / PVGIS-ERA5**, 자료기간은 **2005–2023**, 표준 지형 옵션은 `usehorizon=1`이다. 이는 공개 계산 시험이며 실측·현장조사·계통 접속 확인이 아니다.

## GitHub CI와 후속 검증

v1.27 커밋의 [CI 실행](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/35958328263)은 실패했다. Setup Node.js의 `pnpm store path --silent`가 `packages field missing or empty`로 종료했고, 이후 의존성 설치·테스트·빌드·자료 검증은 실행되지 않았다. 운영 파일 일치와 실제 API 성공은 이 CI 결과와 별도로 확인했다.

후속 작업본의 `pnpm-workspace.yaml`에 `packages: ['.']`를 추가한 뒤, pnpm **9.15.9**의 같은 store 조회 명령은 종료 코드 0으로 성공했다. 이전 설정의 작은 독립 재현은 같은 오류로 실패했다. 검사 전후 작업본의 lock 파일과 workspace 파일 해시는 같았으며 프로젝트 의존성을 설치하지 않았다. 이 제한 검증은 새 커밋의 전체 CI 성공을 대신하지 않는다.

v1.27.1 게시 후에는 새 소스 커밋, 최종 GitHub main, Cloudflare 배포 ID, 운영 파일 해시와 CI 결과를 다시 확인해 이 문서를 갱신한다. 기존 사용자 PC의 5173 서버 전환과 전체 UI·인쇄·모바일 회귀 검사는 이 문서의 독립 배포 검증 범위에 포함되지 않는다.

## 이전 배포 이력

직전 v1.25 배포는 `cb0731e4-2f06-4b67-ae7a-e3e20a0e7e6d`, 빌드일 2026-09-11, main JS `index-ClR_BLMJ.js`였다. 2026-09-11 사용자 제공 보고서는 당시 HTTP·화면 검사 통과를 기록했다. 해당 이전 검사 결과를 새 v1.27이나 v1.27.1의 검사 결과로 간주하지 않는다.
