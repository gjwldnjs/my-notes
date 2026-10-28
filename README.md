# 내 메모장

폴더처럼 정리하고(열 펼침 화면), 마크다운으로 쓰는 개인 메모장.
업무일지·일기는 날짜별 자동 생성, 영양제는 체크 표, 전체 검색과 #태그.

## 파일
- `index.html`, `style.css` — 화면
- `app.js` — 열 목록·편집기·검색·일지·설정
- `store.js` — 메모 데이터, 이 기기 저장(IndexedDB)
- `sync.js` — GitHub 비공개 저장소와 동기화
- `supp.js` — 영양제 체크 표
- `sw.js`, `manifest.webmanifest`, `icon*` — 휴대폰 홈 화면 앱·오프라인
- `test/mock-github.js` — 테스트용 가짜 GitHub 서버

## 데이터가 저장되는 곳
1. 이 기기 브라우저 안 (항상, 인터넷 없어도)
2. GitHub 비공개 저장소 (설정에서 연결하면) — 폴더·.md 파일로 보관돼서 앱 없이도 읽을 수 있음

같은 메모를 두 기기에서 동시에 고치면 나중에 저장한 쪽이 남는다(메모 단위).
서로 다른 메모는 둘 다 남는다.

## 배포 (GitHub Pages)
1. GitHub에 **공개** 저장소 `my-notes` 를 만들고 이 폴더를 올린다 (코드만 있고 메모·토큰은 없음)
2. 저장소 Settings → Pages → Branch: `main` / `(root)` → Save
3. 1~2분 뒤 `https://<아이디>.github.io/my-notes/` 로 접속
4. 앱 설정에서 메모용 **비공개** 저장소(`my-notes-data`)와 토큰을 넣는다
5. 휴대폰: 같은 주소 접속 → 공유 → "홈 화면에 추가"

## 로컬 실행
```
python -m http.server 5180
```
http://localhost:5180 · 가짜 GitHub로 시험: `node test/mock-github.js` 후 `?dev` 붙여 접속,
설정에 저장소 `me/notes`, 토큰 `test-token`, API `http://127.0.0.1:8787`
