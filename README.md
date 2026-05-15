# Codex Notebook Local

로컬에 설치된 Codex CLI를 웹 UI로 감싸는 데스크탑 우선 로컬 앱입니다. OpenAI API key를 요구하지 않고 Codex CLI의 로그인 상태와 권한 모델을 그대로 사용합니다.

## 설치

```bash
npm install -g codex-notebook-local
codex-notebook
```

실행 후 브라우저에서 `http://localhost:3737` 이 열립니다.

## 개발

```bash
npm install
npm run dev
```

개발 모드에서는 Vite 클라이언트가 `http://127.0.0.1:5173`, API/WebSocket 서버가 `http://127.0.0.1:3737` 에서 실행됩니다.

## 빌드

```bash
npm run build
npm start
```

## Codex CLI

앱 시작 시 다음을 확인합니다.

```bash
codex --version
codex login status
```

로그인되어 있지 않으면 하단 터미널을 열고 사용자가 직접 `codex login`을 실행하도록 안내합니다. 앱은 Codex 인증 파일을 직접 읽지 않고 토큰도 저장하지 않습니다.

## 주요 기능

- 폴더별 세션 목록
- 가운데 채팅 UI와 가운데 영역 하단 터미널
- xterm.js + node-pty 기반 로컬 터미널
- Codex CLI 비대화형 실행 스트리밍
- Codex app-server 상태 조회 기반 계정/한도 카드와 30초 자동 새로고침
- 이미지/base64 inline 렌더링 차단 및 `data:image/...base64` attachment 저장
- 이미지 카드의 원본 열기, 파일 위치 열기, 경로 복사, 삭제
- 첨부 파일을 workspace의 `.codex-notebook/attachments/{sessionId}` 에 저장
- 패널 폭/터미널 높이 드래그 조절
- 패널 아이콘 접기/펼치기
- 다크/라이트 모드 전환
- OS 폴더 선택창으로 workspace 추가
- `~/.codex/skills`의 스킬 목록 표시와 `$스킬명` 태그 입력
- 한글/터미널/코드/마크다운 폰트 설정 저장
- 단축키: `Ctrl/Cmd + Enter` 보내기, `Ctrl/Cmd + \`` 터미널 토글, `Ctrl/Cmd + K` 세션 검색, `Esc` 모달 닫기
