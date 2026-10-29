# 내 메모장

폴더처럼 정리하고(열 펼침 화면), 마크다운으로 쓰는 개인 메모장.
업무일지·일기는 날짜별 자동 생성, 영양제는 체크 표, 월별 캘린더, 전체 검색과 #태그.

## 파일
- `index.html`, `style.css` — 화면
- `app.js` — 열 목록·편집기·검색·일지·설정
- `store.js` — 메모 데이터, 이 기기 저장(IndexedDB)
- `cloud.js` — 로그인(Firebase Auth)과 메모 동기화(Firestore)
- `firebase-config.js` — Firebase 프로젝트 정보(공개 정보), `firestore.rules` — 각자 자기 메모만 읽고 쓰게 하는 보안 규칙
- `supp.js` — 영양제 체크 표
- `calendar.js`, `holidays.js` — 월별 캘린더(반복·여러 날 일정), 한국 공휴일
- `widget/` — 아이폰 Scriptable 캘린더 위젯과 설치 안내
- `vendor/editor.js`, `vendor/firebase.js` — 편집기(Tiptap)·Firebase 묶음. 원본은 `editor-src/editor.js`,
  고친 뒤 `editor-src`에서 `npm install` (처음 한 번) → `npm run build`
- `sw.js`, `manifest.webmanifest`, `icon*` — 휴대폰 홈 화면 앱·오프라인
- `test/mock-github.js` — 테스트용 가짜 GitHub 서버

## 데이터가 저장되는 곳
1. 이 기기 브라우저 안 (항상, 인터넷 없어도)
2. 로그인하면 Firebase(Firestore, 서울) `users/{계정}/nodes/` — 계정마다 나뉘고, 보안 규칙으로 자기 것만 읽고 쓴다
   (운영자는 Firebase 콘솔에서 데이터에 접근할 수 있으니 사용자에게 알릴 것)

같은 메모를 두 기기에서 동시에 고치면 나중에 저장한 쪽이 남는다(메모 단위). 서로 다른 메모는 둘 다 남는다.
로그아웃하면 그 기기의 메모는 지워진다(다음 사람이 못 보게). 다시 로그인하면 서버에서 돌아온다.
예전 GitHub 저장소(gjwldnjs/my-notes-data)는 2026-10 전환 전까지의 기록 보관용.

## 배포 (GitHub Pages)
1. GitHub에 **공개** 저장소 `my-notes` 를 만들고 이 폴더를 올린다 (코드만 있고 메모·토큰은 없음)
2. 저장소 Settings → Pages → Branch: `main` / `(root)` → Save
3. 1~2분 뒤 `https://<아이디>.github.io/my-notes/` 로 접속
4. 앱 설정에서 메모용 **비공개** 저장소(`my-notes-data`)와 토큰을 넣는다
5. 휴대폰: 같은 주소 접속 → 공유 → "홈 화면에 추가"

## 로컬 실행·시험
가짜 Firebase(에뮬레이터, Java 필요): `npx firebase-tools@13 emulators:start --only auth,firestore --project demo-my-notes`
→ 앱을 `http://localhost:5180/?emu` 로 열면 에뮬레이터에 붙는다 (보안 규칙도 그대로 적용).

```
python -m http.server 5180
```
위젯 시험: 에뮬레이터 모드 앱에서 로그인 → 설정의 위젯 연결 코드를 받아
`WIDGET_CODE=<코드> node test/widget-harness.mjs large` (또는 medium, small, `large dark`) → `test/out/widget-large.html`
