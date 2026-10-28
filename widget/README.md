# 아이폰 캘린더 위젯 설치하기

홈 화면에 이번 달 달력(일정·공휴일·일지 쓴 날)을 띄우는 위젯이에요.
**Scriptable**이라는 무료 앱이 이 파일(`메모장-캘린더-위젯.js`)을 실행해서 위젯을 그려요.

> 먼저 메모장 앱이 GitHub에 올라가 있고, 메모가 비공개 저장소(`my-notes-data`)에 동기화되고 있어야 해요.

## 1. 위젯 전용 토큰 만들기 (권장)
위젯은 읽기만 하므로 **읽기 전용** 토큰을 따로 쓰는 게 안전해요.
1. GitHub → 프로필 사진 → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token
2. 이름: `widget`, Repository access: Only select repositories → `my-notes-data`
3. Permissions → Repository permissions → **Contents: Read-only**
4. Generate → 토큰 복사

## 2. Scriptable에 스크립트 넣기
1. App Store에서 **Scriptable** 설치
2. 사파리에서 `https://<아이디>.github.io/my-notes/widget/메모장-캘린더-위젯.js` 열기 → 전체 선택 → 복사
3. Scriptable → 오른쪽 위 ＋ → 붙여넣기 → 위쪽 제목을 `내 메모장 캘린더`로 바꾸기 → Done

## 3. 처음 한 번 설정
Scriptable에서 `내 메모장 캘린더`를 누르면 설정 창이 떠요.
- 저장소: `아이디/my-notes-data`
- 토큰: 1번에서 만든 토큰
- 앱 주소: `https://<아이디>.github.io/my-notes/`

저장하면 큰 위젯 미리보기가 나와요. 다시 실행하면 미리보기·설정 다시 하기를 고를 수 있어요.

## 4. 홈 화면에 올리기
1. 홈 화면 빈 곳을 길게 누르기 → 왼쪽 위 **편집** → **위젯 추가**
2. **Scriptable** 선택 → 옆으로 넘겨 **큰 크기(4×4)** → 위젯 추가
3. 올라온 위젯을 길게 누르기 → **위젯 편집** → Script: `내 메모장 캘린더`

같은 방법으로 중간 크기(다가오는 2주 일정), 작은 크기(오늘)도 쓸 수 있어요.

## 알아 둘 점
- 위젯은 iOS가 정한 때에 새로 그려져요(보통 15~30분 간격). 방금 넣은 일정은 조금 늦게 보일 수 있어요.
- 날짜 칸을 누르면 그 날짜가 선택된 캘린더가 **사파리**에서 열려요. 홈 화면에 설치한 메모장 앱으로 바로 열리게 하는 건 iOS가 막아 둬서 안 돼요. 사파리에서도 처음 한 번 설정에 저장소·토큰을 넣으면 같은 메모가 보여요.
- 인터넷이 없으면 마지막으로 받아 둔 달력을 보여 주고 오른쪽 위에 "오프라인"이라고 표시해요.
- 공휴일은 2026~2027년까지 들어 있어요. 그 뒤로는 앱의 `holidays.js`와 이 스크립트의 `HOLIDAYS` 표에 추가해야 해요.
