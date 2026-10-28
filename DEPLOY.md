# Render Free + Neon Free 배포

로그인·이메일 인증 없는 공개 웹앱입니다. 무료 서버의 로컬 파일시스템은 영구 저장 용도로 쓰지 않습니다. `DATABASE_URL`을 설정하면 모든 방문자 식별 정보·매장·리뷰가 Neon PostgreSQL에 저장됩니다. 무료 플랜 한도와 현재 요금 정책은 서비스 화면에서 확인해야 합니다.

## 1. Neon

1. Free plan 프로젝트를 만들고 **Connect**를 엽니다.
2. 생성된 `production` 브랜치와 기본 DB·역할을 선택합니다.
3. Connection pooling 옵션이 있으면 활성화하고 PostgreSQL 연결 문자열을 복사합니다.
4. 비밀번호가 포함된 문자열을 채팅이나 Git에 보내지 말고 Render의 보안 환경 변수에 직접 입력합니다. `postgresql://…?sslmode=require` 형태의 전체 문자열이 필요합니다.

앱은 `pg`를 사용해 연결하며 TLS 인증서 검증을 유지합니다. DB 스키마는 서버 시작 시 `matzip_` 접두사의 테이블에 자동 생성합니다. Neon의 Better Auth는 필요하지 않습니다. 현재 사용자의 Neon 프로젝트는 화면상 Ohio에 생성되어 있으므로 새 무료 Render 서비스도 Ohio를 제안합니다.

## 2. Render 무료 서비스

가장 간단한 방법은 **New → Web Service**입니다.

- GitHub: `jaein450-code/TEST`, Branch: `main`
- Runtime: Node
- Region: Ohio(사용자 Neon 프로젝트와 가까운 위치)
- Instance type: **Free**
- Build command: `npm ci --omit=dev && npm run build`
- Start command: `npm start`
- Health check path: `/healthz`
- Environment: `NODE_ENV=production`, `DATABASE_URL=Neon에서 복사한 전체 문자열`
- Persistent disk: **추가하지 않음**
- `DATA_DIR`, 메일 발송 키, 발신 주소: 새 무료 서비스에는 설정하지 않음

Render가 자동 제공하는 `RENDER_EXTERNAL_URL`을 HTTPS 기준 주소로 사용합니다. 별도 도메인을 연결한 경우만 `PUBLIC_ORIGIN=https://연결한주소`를 추가합니다(끝 슬래시 없이).

Blueprint 방식을 쓰려면 **Blueprint Path를 `render-free.yaml`로 지정**하세요. 해당 파일은 `plan: free`와 `DATABASE_URL`만 요구하며 유료 디스크를 생성하지 않습니다. 기본 `render.yaml`은 기존 유료 서비스의 디스크를 자동 삭제하지 않도록 남겨 두었습니다. 무료 배포에 기본 파일을 선택하지 마세요.

이미 유료 서비스나 기존 SQLite 데이터가 있다면 새 무료 서비스를 별도로 만들고 데이터 이관을 확인한 뒤 이전 서비스를 처리하세요. 기존 디스크를 먼저 삭제하거나 기존 서비스의 `DATA_DIR`을 제거하면 안 됩니다. 이 변경은 기존 서비스나 디스크를 삭제하지 않습니다.

## 무료 서비스 동작

사용하지 않는 동안 서버나 DB가 절전 상태로 전환되어 첫 요청이 느릴 수 있습니다. 무료 사용량·저장 용량·연결 수 한도가 있습니다. Hobby/Free 계정이라는 표시만으로 다른 유료 서비스가 무료가 되지는 않습니다. Upgrade나 유료 디스크를 선택하지 마세요. 실제 배포 생성·청구 상태는 이 작업 환경에서 확인하지 못했습니다.

## 배포 후 확인

- 외부 HTTPS 주소의 `/healthz`: 200 `{"status":"ok"}`
- `/`: 로그인 없이 공개 맛집 목록
- 매장·리뷰 등록 후 다른 브라우저에서도 조회 가능
- 본인 브라우저에서만 리뷰 삭제 가능
- 서비스 재시작·재배포 후에도 매장·리뷰와 쿠키 소유권 유지
- `/api/auth/*`: 404, DB 파일 경로: 404
- `/preview`: 별도의 가상 데이터 화면 미리보기이며 실제 등록은 서버 `/`에서 이용

DATABASE_URL 누락·DB 접속 오류가 있으면 서버는 임시 SQLite로 자동 전환하지 않습니다. 오류 로그에 연결 문자열을 출력하지 않도록 했습니다. 이 경우 Render 환경 변수의 값과 Neon 연결 상태를 확인하세요.

## 데이터와 제한

기본 6곳은 가상 매장입니다. 실제 네이버 데이터 수집과 외부 Neon 접속은 아직 검증되지 않았습니다. 기존 SQLite 데이터를 Neon으로 자동 복사하지 않습니다. 백업·복구와 공개 게시물 관리는 운영 전에 준비해야 합니다.

테스트는 PGlite(실제 PostgreSQL 엔진의 WASM 버전)로 SQL·데이터 영속성·동시 요청 제한·삭제 권한을 검증하며, 실제 Neon 원격 인증·네트워크·Render HTTPS 검증을 대신하지 않습니다.
