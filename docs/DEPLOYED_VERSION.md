# 공개 배포 상태 — v1.27.1

2026-09-24에 GitHub, 기존 Cloudflare Pages 운영 주소, Windows 로컬 5173 실행판을 갱신했다.

## 실제 게시 증거
- 운영 URL: https://solar-site-precheck.pages.dev/
- 배포 URL: https://40c9c8a3.solar-site-precheck.pages.dev/
- Cloudflare production ID: `40c9c8a3-10e7-4e91-9e4b-b813387223fb`
- 소스 커밋: `655eec45e03a57d0560bae03335e5957d9933bbf`
- 배포 파일을 포함한 GitHub 커밋: `2dd9d7163c4fd1832f785d9f1552fddb4d2beecc`
- 공개 파일: `index-BAyOgCG3.js` / 로컬 파일: `index-ClqyUBO8.js`
- 버전 1.27.1 / build date 2026-09-24

문서만 갱신한 후속 커밋은 위 소스/배포 파일의 커밋과 다를 수 있다. GitHub push만으로 Pages가 배포되지 않으며, 이번에는 인증된 Wrangler로 기존 프로젝트에 직접 배포했다.

## 확인 결과
- 패키징의 자동 테스트 165개, 공개/portable 빌드, CSP, 매뉴얼 PDF와 OCR 자산, Functions 번들, ZIP 파일 해시 검증 통과.
- 실제 운영 HTML·주요 JS·PWA manifest가 검증된 Cloudflare 패키지와 일치. 버전·일자·실행 대상, API 요청 검사, 배포 ID·branch·source, GitHub 원격 커밋까지 총 12개 게시 검사를 통과했다.
- [GitHub CI 35960897697](https://github.com/Sonikim1743/Solar-site-precheck/actions/runs/35960897697)의 Test and build job 107509041190 성공. 설치·테스트·빌드·CSP·PDF/OCR·배포 메타데이터 모두 성공했다. 이전 pnpm 9 workspace 초기화 실패를 `packages: ['.']`로 수정했다.
- 새 Windows portable 복사본의 파일 56개 해시 일치. 시험 주소에서 HTML, PDF 실제 형식, 계통 API 요청 검사, NEDO 정상/오류, PDF API 메서드 검사 6개 통과 후 기존 5173을 같은 버전으로 교체하고 동일한 6개 검사도 통과했다. 로컬/공개 브라우저에서 Version 1.27.1을 확인했고, 기존 로컬 후보지 좌표·주소·표고가 보존됐다. 개인 PDF 업로드 검사는 생략했다.
- 원래 개발 소스와 브라우저 자료를 보존했다. 다음 Windows 실행부터는 새 `SolarSitePrecheck-Local-v1.27.1/START_LOCAL_ONLY.cmd`를 사용한다. 옛 소스 폴더의 실행 파일은 예전 소스를 다시 빌드할 수 있다.

## 패키지
| 대상 | 파일 | SHA-256 |
|---|---|---|
| Cloudflare | SolarSitePrecheck_v1.27.1_2026-09-24_cloudflare.zip | f329438de78c014b0e930edb41ee4add68a8a0383847833865f4e8c9d02fa7f4 |
| Windows | SolarSitePrecheck_v1.27.1_release_light.zip | a3389ac12e0ef817da450f53358c7d4a29ab6e523def048a80a4385f16dc799d |

## 화면과 인수인계
지도 → 지평선·적설 → 발전량 → 레포트 → 자료/매뉴얼을 한 페이지에서 펼쳐 쓰는 흐름을 유지한다. GEONEX 확인 버튼과 상단 중복 현황을 제거하고, 추가 도구는 기본 접힘으로 정리했다. 실제 데스크톱 확인과 한계는 `V1_27_1_BROWSER_CHECK_KO.md`를 따른다. 최종 390px 화면 검증은 미확인이다.

앞으로 코드는 Mac OpenClaw에서 수정하는 계획이며 `MAC_OPENCLAW_START_KO.md`로 이어받는다. Mac 실기에서의 clone·설정·실행은 아직 수행하지 않았다. 비공개 업무 자료/대화/기억은 공개 GitHub에 포함하지 않았다.

## 이전 이력
- v1.27: 2026-09-24, deployment `69ea5bef-3ac3-4897-9aa1-2c9eeaa66a35`, source `f6fb2e245a4955f7171f7b864f950fa8eaffa616`. 같은 날 사용자 피드백으로 v1.27.1로 갱신.
- v1.25: 사용자 제공 2026-09-11 배포 보고서의 deployment `cb0731e4-2f06-4b67-ae7a-e3e20a0e7e6d`.
