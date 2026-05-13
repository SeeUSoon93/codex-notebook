# Codex Notebook Local 구현 지시서

## 1. 프로젝트 목표

npm으로 설치해서 어디서든 사용할 수 있는 로컬 웹 기반 Codex UI 앱을 만든다.

앱 이름은 일단 `codex-notebook-local`로 한다.

설치 후 사용자는 아래처럼 실행할 수 있어야 한다.

```bash
npm install -g codex-notebook-local
codex-notebook
```

실행하면 로컬 서버가 뜨고 브라우저에서 웹앱이 열린다.

```txt
http://localhost:3737
```

이 앱은 Codex API를 직접 쓰는 앱이 아니다.  
로컬에 설치된 Codex CLI를 감싸는 UI다.

Codex가 로그인되어 있으면 그대로 사용하고, 로그인되어 있지 않으면 앱에서 알림창을 띄운다.

```txt
Codex 로그인이 필요합니다.
아래 터미널에서 `codex login`을 실행해 주세요.
```

그리고 하단 터미널을 자동으로 열어 사용자가 바로 로그인할 수 있게 한다.

---

## 2. 기술 스택

다음 구조로 구현한다.

- Node.js
- TypeScript
- Vite
- React
- Express 또는 Fastify
- WebSocket
- xterm.js
- node-pty
- SQLite
- npm global bin CLI

패키지 구조:

```txt
codex-notebook-local/
├─ package.json
├─ bin/
│  └─ codex-notebook.ts
├─ src/
│  ├─ server/
│  │  ├─ index.ts
│  │  ├─ codex.ts
│  │  ├─ terminal.ts
│  │  ├─ sessions.ts
│  │  ├─ status.ts
│  │  ├─ attachments.ts
│  │  └─ db.ts
│  └─ client/
│     ├─ main.tsx
│     ├─ App.tsx
│     ├─ components/
│     │  ├─ LeftSessionPanel.tsx
│     │  ├─ ChatPanel.tsx
│     │  ├─ RightPanel.tsx
│     │  ├─ BottomTerminal.tsx
│     │  ├─ ChatInput.tsx
│     │  ├─ FontSettingsModal.tsx
│     │  ├─ StatusCard.tsx
│     │  ├─ ImageListCard.tsx
│     │  └─ SkillCards.tsx
│     └─ styles/
│        └─ app.css
└─ README.md
```

---

## 3. 핵심 레이아웃

앱은 3패널 + 가운데 하단 터미널 구조다.

```txt
┌─────────────────────────────────────────────────────────────────────┐
│ 왼쪽 세션 패널 │          가운데 채팅 영역          │ 오른쪽 패널    │
│               │                                  │               │
│ 폴더별 세션    │          채팅 메시지              │ 상태 카드       │
│ 목록           │                                  │ 이미지 카드     │
│               │                                  │ 스킬 카드       │
│               │                                  │ 폰트 설정       │
├───────────────┴──────────────────────────────────┴───────────────┤
│ 가운데 영역 하단에만 접히는 터미널 패널                              │
└─────────────────────────────────────────────────────────────────────┘
```

중요 조건:

- 양쪽 패널은 위치를 고정하되, 폭은 마우스 드래그로 자유롭게 조절할 수 있어야 한다.
- 채팅창과 터미널창은 가운데 영역에만 속한다.
- 터미널 토글 버튼은 채팅창 하단, 입력창 근처에 둔다.
- 터미널은 VS Code처럼 열고 닫을 수 있어야 한다.
- 터미널이 열리면 가운데 채팅 영역의 아래쪽을 차지한다.
- 터미널은 현재 선택된 세션의 workspace folder에서 열린다.

### 패널 크기 조절 및 접기

왼쪽 세션 패널, 오른쪽 패널, 가운데 하단 터미널은 사용자가 마우스로 크기를 조절할 수 있어야 한다.

- 왼쪽/오른쪽 패널: 세로 리사이즈 핸들을 드래그해서 폭 조절
- 하단 터미널: 가로 리사이즈 핸들을 드래그해서 높이 조절
- 리사이즈 중에도 채팅 영역과 입력창 레이아웃이 깨지지 않아야 함
- 패널 크기는 localStorage와 SQLite settings 테이블에 저장하고 재시작 후 유지

각 패널은 아이콘 버튼으로 접고 펼칠 수 있어야 한다.

- 접힌 상태에서도 완전히 사라지지 않고, 상단에 아이콘 버튼을 표시할 최소 영역은 남긴다.
- 왼쪽/오른쪽 패널은 접히면 아이콘 레일 수준의 최소 폭만 남긴다.
- 하단 터미널은 접히면 터미널 토글 아이콘이 있는 최소 높이만 남긴다.
- 아이콘을 클릭하면 이전에 사용자가 조절했던 크기로 다시 펼친다.
- 패널의 최소 크기는 텍스트를 억지로 보여주는 크기가 아니라 아이콘 버튼이 안전하게 보이는 크기를 기준으로 한다.

---

## 4. 왼쪽 세션 패널

왼쪽에는 채팅 목록을 폴더별로 보여준다.

예시:

```txt
Dockit
├─ 로그인 버그 수정
├─ 이미지 생성 파이프라인
└─ 에디터 성능 개선

sud-ui
├─ Button 리팩터링
└─ Theme token 정리

default
├─ 임시 작업 1
└─ 임시 작업 2
```

세션은 반드시 folder/workspace 기준으로 그룹핑한다.

데이터 모델:

```ts
type WorkspaceFolder = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

type ChatSession = {
  id: string;
  folderId: string;
  title: string;
  codexSessionId?: string;
  model: string;
  intelligence: "fast" | "normal" | "deep" | "xhigh";
  permissionMode: "read-only" | "workspace-write" | "full-auto";
  createdAt: string;
  updatedAt: string;
};
```

---

## 5. 가운데 채팅창

채팅창은 일반 채팅 UI처럼 보이되, 무거운 데이터는 절대 직접 렌더링하지 않는다.

### 매우 중요한 규칙

이미지나 base64는 채팅창에 절대 inline으로 넣지 않는다.

금지:

```txt
data:image/png;base64,...
```

금지:

```html
<img src="data:image/png;base64,..." />
```

금지:

```json
{
  "content": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```

허용:

```ts
type AttachmentRef = {
  id: string;
  type: "image" | "file";
  filename: string;
  filePath: string;
  thumbnailPath?: string;
  mimeType: string;
  size: number;
};
```

채팅창에는 이미지 원본이 아니라 작은 썸네일만 보여준다.

예:

```txt
[이미지 4개 생성됨]
[작은 썸네일] [작은 썸네일] [작은 썸네일] [작은 썸네일]
```

썸네일 클릭 시 다음 기능을 제공한다.

- 원본 파일 열기
- 파일 위치 열기
- 복사
- 삭제

긴 출력도 자동으로 접는다.

기본 규칙:

```txt
텍스트 10,000자 초과 → 접힘
로그 200줄 초과 → 접힘
코드블록 300줄 초과 → 접힘
diff 500줄 초과 → 접힘
base64 감지 → 저장하지 않고 attachment로 분리 또는 표시 차단
```

---

## 6. 채팅 입력창

채팅 입력창에는 다음 컨트롤을 넣는다.

```txt
[ + ] [ 폴더 선택 ] [ 권한 선택 ] [ 인텔리전스/모델 선택 ] [ 터미널 토글 ] [ 보내기 ]
```

### + 버튼

파일/사진을 추가할 수 있다.

- 사진 추가
- 파일 추가
- 여러 파일 추가

첨부된 파일은 workspace 안의 attachments 폴더에 복사한다.

예:

```txt
{workspace}/.codex-notebook/attachments/{sessionId}/image-001.png
{workspace}/.codex-notebook/attachments/{sessionId}/spec.pdf
```

Codex에게는 base64가 아니라 파일 경로만 알려준다.

예:

```txt
첨부 파일:
- .codex-notebook/attachments/{sessionId}/image-001.png
- .codex-notebook/attachments/{sessionId}/spec.pdf
```

### 폴더 선택

사용자가 폴더를 선택하지 않으면 기본 폴더를 사용한다.

Windows 기본값:

```txt
C:\Users\{username}\CodexNotebook\workspaces\default
```

macOS/Linux 기본값:

```txt
~/CodexNotebook/workspaces/default
```

기본 폴더가 없으면 자동 생성한다.

절대 `C:\` 루트에 바로 만들지 않는다.

### 권한 선택

권한 선택지는 3개만 둔다.

```txt
읽기 전용
Workspace 수정
Full Auto
```

내부 매핑:

```txt
읽기 전용
→ read-only 계열 옵션

Workspace 수정
→ workspace-write + on-request 계열 옵션

Full Auto
→ 가능한 경우 승인 최소화
```

단, 위험한 bypass 옵션은 기본 UI에 넣지 않는다.  
필요한 경우 사용자가 하단 터미널에서 직접 실행할 수 있게 한다.

### 인텔리전스 및 모델 선택

UI 이름은 “인텔리전스”로 한다.

선택지:

```txt
빠르게
보통
깊게
극한
```

모델 선택도 같이 제공한다.

기본값은 현재 Codex CLI가 쓰는 기본 모델을 따르되, UI에서 직접 선택할 수 있게 한다.

예:

```txt
gpt-5.5
gpt-5.5-codex
codex-mini-latest
```

실제 사용 가능한 모델 목록은 하드코딩하지 말고 설정 가능하게 만든다.

---

## 7. 오른쪽 패널

오른쪽 패널에는 다음 카드만 둔다.

```txt
1. 상태 카드
2. 생성 이미지 리스트 카드
3. 스킬 카드
4. 폰트 설정 카드
```

### 상태 카드

토큰 사용량을 직접 계산하지 않는다.

Codex의 `/status` 출력에서 필요한 것만 파싱해서 한국어로 보여준다.

예시 입력:

```txt
/status

╭───────────────────────────────────────────────────────────────────────╮
│  >_ OpenAI Codex (v0.130.0)                                           │
│                                                                       │
│  Model:                gpt-5.5 (reasoning xhigh, summaries auto)      │
│  Directory:            ~                                              │
│  Permissions:          Workspace (on-request)                         │
│  Agents.md:            <none>                                         │
│  Account:              rlarnstns@gmail.com (Plus)                     │
│  Collaboration mode:   Default                                        │
│  Session:              019e1ef4-fda0-78d0-8afa-5ac397dc8028           │
│                                                                       │
│  5h limit:             [████████████████░░░░] 80% left (resets 14:26) │
│  Weekly limit:         [███░░░░░░░░░░░░░░░░░] 17% left (resets 20:44) │
╰───────────────────────────────────────────────────────────────────────╯
```

UI 출력:

```txt
계정
rlarnstns@gmail.com (Plus)

5시간 한도
80% 남음 · 14:26 초기화

주간 한도
17% 남음 · 20:44 초기화
```

파싱할 필드:

- Account
- 5h limit 또는 6h limit 등 실제 출력되는 시간 제한
- Weekly limit

주의:

- 5h, 6h 등은 하드코딩하지 말고 `/status` 출력에서 감지한다.
- `left`는 `남음`으로 표시한다.
- `resets`는 `초기화`로 표시한다.

### 생성 이미지 리스트 카드

현재 세션에서 생성되거나 첨부된 이미지들을 아주 작은 썸네일로 보여준다.

- 32px 또는 40px 썸네일
- 클릭 시 원본 보기
- 파일 위치 열기
- 채팅 메시지로 이동

### 스킬 카드

스킬은 처음에는 복잡한 플러그인 시스템으로 만들지 말고 prompt preset으로 만든다.

```ts
type SkillCard = {
  id: string;
  title: string;
  description: string;
  prompt: string;
};
```

기본 스킬:

```txt
버그 수정
UI 개선
리팩터링
테스트 작성
문서화
성능 개선
PR 리뷰
이미지 생성
```

누르면 채팅 입력창에 프롬프트를 삽입한다.  
Shift+Click 또는 옵션으로 바로 실행할 수 있게 한다.

---

## 8. 폰트 설정

폰트 설정은 반드시 제공한다.

설정 항목:

```txt
한글 폰트
터미널 폰트
코드 폰트
마크다운 폰트
```

각각 CSS variable로 관리한다.

```css
:root {
  --font-korean: "Pretendard";
  --font-terminal: "JetBrains Mono";
  --font-code: "JetBrains Mono";
  --font-markdown: "Pretendard";
}
```

UI 적용:

```css
body {
  font-family: var(--font-korean), system-ui, sans-serif;
}

.terminal {
  font-family: var(--font-terminal), monospace;
}

.code-block {
  font-family: var(--font-code), monospace;
}

.markdown-content {
  font-family: var(--font-markdown), var(--font-korean), sans-serif;
}
```

폰트 설정은 localStorage와 SQLite settings 테이블에 저장한다.

---

## 9. Codex 로그인 감지

앱 시작 시 Codex CLI가 있는지 확인한다.

1. `codex --version` 실행
2. 실패하면 설치 안내 모달 표시

설치 안내:

```txt
Codex CLI가 설치되어 있지 않습니다.

아래 명령어로 설치해 주세요.

npm install -g @openai/codex
```

Codex CLI가 있으면 로그인 상태를 확인한다.

가능하면 다음 명령을 사용한다.

```bash
codex login status
```

실패하거나 비로그인 상태면 모달을 띄운다.

```txt
Codex 로그인이 필요합니다.
아래 터미널에서 `codex login`을 실행해 주세요.
```

그리고 하단 터미널을 열고 현재 명령어를 미리 입력하거나 안내한다.

터미널에서 사용자가 `codex login`을 직접 실행할 수 있어야 한다.

중요:

- 앱이 Codex auth 파일을 직접 읽지 않는다.
- 앱이 토큰을 저장하지 않는다.
- 앱이 OpenAI API key를 요구하지 않는다.
- 인증은 Codex CLI에게 맡긴다.

---

## 10. 하단 터미널

하단 터미널은 xterm.js + node-pty로 구현한다.

기능:

- 열기/닫기
- 현재 세션 workspace에서 시작
- shell 선택 자동
  - Windows: PowerShell
  - macOS/Linux: 사용자의 기본 shell
- 사용자가 직접 `codex`, `codex login`, `npm`, `pnpm`, `git` 등을 실행 가능
- 터미널 크기 변경 가능
- 채팅창 하단 토글 버튼으로 열고 닫기

터미널은 전체 앱 하단이 아니라 가운데 채팅 영역 하단에 붙는다.

---

## 11. 세션 실행 방식

채팅에서 메시지를 보내면 서버가 Codex CLI를 실행한다.

가능한 경우 비대화형 실행을 우선 사용한다.

```bash
codex exec "사용자 프롬프트"
```

또는 현재 CLI 버전에 맞는 실행 명령을 감지해서 사용한다.

중요:

- 특정 Codex 옵션을 하드코딩하지 말고, 래퍼 함수를 만들어 관리한다.
- 현재 CLI 버전에서 옵션이 다르면 쉽게 수정 가능해야 한다.
- CLI stdout/stderr를 스트리밍해서 채팅창에 보여준다.
- 이미지/base64/긴 로그는 채팅 DOM에 직접 넣지 않는다.

---

## 12. 이미지/base64 처리

stdout/stderr에서 base64 이미지처럼 보이는 내용이 나오면 채팅에 그대로 출력하지 않는다.

감지 규칙:

- `data:image/`
- 매우 긴 base64-like 문자열
- markdown image에 base64가 들어간 경우
- JSON 필드 안에 큰 base64가 들어간 경우

처리:

1. base64를 파일로 저장 가능한 경우 파일로 저장
2. 썸네일 생성
3. ChatMessage에는 AttachmentRef만 저장
4. 채팅에는 작은 썸네일만 표시
5. 오른쪽 이미지 카드에 추가

만약 파일로 저장할 수 없으면:

- base64 본문은 화면에 표시하지 않는다.
- “숨겨진 대용량 이미지 데이터”라는 접힌 카드만 보여준다.

---

## 13. DB 스키마

SQLite를 사용한다.

필요 테이블:

```sql
folders
sessions
messages
attachments
settings
skills
```

messages에는 base64 원문을 저장하지 않는다.

attachments에는 파일 경로와 썸네일 경로만 저장한다.

---

## 14. UI 스타일

전체적으로 VS Code + Jupyter Notebook 느낌으로 만든다.

- 과한 장식 금지
- 패널 기반
- 밀도 높은 UI
- 둥근 모서리는 적당히
- 다크 모드 기본
- 라이트 모드도 지원
- 반응형은 데스크탑 우선
- 키보드 단축키 지원

단축키:

- Ctrl/Cmd + Enter: 보내기
- Ctrl/Cmd + `: 터미널 토글
- Ctrl/Cmd + K: 세션 검색
- Esc: 모달 닫기

---

## 15. 구현 전 확인

먼저 현재 Codex CLI에서 지원하는 정확한 명령어와 옵션을 확인한다.

```bash
codex --help
codex login --help
codex login status
```

확인한 결과에 맞춰 `src/server/codex.ts`의 명령어 매핑을 구현한다.

명령어가 실패하면 앱이 죽지 말고 사용자에게 설치/로그인/버전 문제를 명확히 보여준다.

`CodexCommandAdapter` 같은 래퍼를 만들어 CLI 옵션 변경에 대응하기 쉽게 한다.

---

## 16. 완료 조건

다음이 실제로 동작해야 한다.

1. `npm install -g` 후 `codex-notebook` 명령 실행
2. 브라우저에서 로컬 웹앱 열림
3. Codex CLI 설치 여부 감지
4. Codex 로그인 여부 감지
5. 비로그인 상태면 로그인 모달 + 하단 터미널 열림
6. 폴더 선택 가능
7. 폴더 미선택 시 기본 workspace 자동 생성
8. 폴더별 세션 목록 표시
9. 채팅 메시지 전송 가능
10. 하단 터미널 열기/닫기 가능
11. 오른쪽 상태 카드에서 `/status` 결과 중 계정/한도만 한국어 표시
12. 이미지/base64를 채팅창에 inline 렌더링하지 않음
13. 이미지는 작은 썸네일로만 표시
14. 생성 이미지 목록 카드 작동
15. 스킬 카드 클릭 시 입력창에 프롬프트 삽입
16. 한글/터미널/코드/마크다운 폰트 설정 가능
17. 설정이 저장되고 재시작 후 유지됨
18. README에 설치/사용법 작성

---

## 17. 1차 구현 우선순위

1차 구현에서는 다음만 완성한다.

- 앱 실행 CLI
- 서버 + React UI
- 3패널 레이아웃
- 하단 터미널
- Codex 설치/로그인 감지
- 폴더별 세션 목록
- 채팅 입력창
- `/status` 파싱 카드
- 폰트 설정
- 이미지/base64 inline 차단

나머지는 최소 동작만 구현해도 된다.

---

## 18. 주의사항

- Codex auth 파일을 직접 읽지 마라.
- OpenAI API key를 요구하지 마라.
- base64를 채팅창에 렌더링하지 마라.
- 이미지 원본을 `<img src="data:...">`로 넣지 마라.
- 오른쪽 패널에 불필요한 파일트리나 복잡한 기능을 넣지 마라.
- 하단 터미널은 가운데 영역에만 붙여라.
- 사용량 카드는 토큰 추적이 아니라 `/status` 출력 파싱만 해라.

---

## 19. 최종 방향

```txt
npm 앱 = 로컬 웹 UI
Codex = 하단 터미널/CLI가 담당
앱 = 세션, 폴더, 썸네일, 상태, 폰트, UX 담당
```
