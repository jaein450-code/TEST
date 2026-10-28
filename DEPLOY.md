# 공개 맛집노트 서버 배포

로그인·메일 인증 없이 누구나 이용하는 구성입니다. Resend 가입·발신 도메인 구매·회사 이메일 설정이 필요하지 않습니다.

## Render

`render.yaml`은 Starter 웹 서비스 1개와 영구 디스크 1GB를 정의합니다. 유료 구성입니다. 생성 전 Render 화면에서 최신 요금을 확인하세요. 저장소에 설정 파일이 있다는 것만으로 서버가 생성되거나 과금되지는 않습니다.

1. Render에서 **New → Blueprint**를 선택하고 GitHub의 `jaein450-code/TEST`와 `main`을 연결합니다.
2. Blueprint Path는 기본 `render.yaml`을 사용합니다.
3. 최신 `main` 설정에서는 메일 발송 키나 발신 이메일을 입력하는 칸이 없습니다. 이전 생성 화면이 열려 있다면 최신 저장소 설정을 다시 불러오세요.
4. 서비스·디스크 요금을 확인하고 동의한 뒤 배포합니다.
5. 발급된 HTTPS 주소에 접속하면 맛집 화면이 바로 열립니다. 가입 화면이 뜨면 배포 커밋이 최신인지 확인하세요.

환경 설정:

- Node.js: `.node-version`의 24.19.0
- Build: `npm run build`
- Start: `npm start`
- Health check: `/healthz`
- Environment: `NODE_ENV=production`, `DATA_DIR=/var/data/matzip`
- Disk: mount `/var/data`, size 1GB
- Origin: 기본 Render 주소는 자동 제공되는 `RENDER_EXTERNAL_URL`을 사용합니다. 커스텀 도메인이 있으면 `PUBLIC_ORIGIN=https://정식주소`를 설정합니다(끝 슬래시 없이).

기존 서비스에 메일 관련 환경 변수가 남아 있으면 관리 화면에서 제거해도 됩니다. 앱은 더 이상 사용하지 않습니다. API 키 값을 채팅이나 Git에 올리지 마세요. Render 계정 연결이 없어 이 작업 환경에서 실제 서비스 생성·외부 URL 발급·실배포 결과를 직접 확인하지 못했습니다.

## 영구 데이터

- `$DATA_DIR/visitors.sqlite`: 익명 브라우저 식별자 해시와 쓰기 요청 제한
- `$DATA_DIR/dining.sqlite`: 공개 매장·방문 리뷰

두 DB와 WAL 파일은 비공개로 유지하고 영구 디스크에 보관합니다. 무료 서버의 임시 파일시스템만 사용하면 재배포 시 데이터가 사라질 수 있습니다. 단일 서버용이며 다중 인스턴스에는 공유 DB가 필요합니다. SQLite의 일관된 백업과 복구 절차를 별도로 준비하세요.

예전 이메일 인증 DB가 있더라도 새 앱에서 쓰지 않으며 자동 삭제하지 않습니다. 기존 직원용 매장과 리뷰가 있으면 공개 전 검토해야 합니다. 공개 전환은 사용자가 명시적으로 선택한 사항입니다.

브라우저 쿠키가 삭제되면 해당 브라우저의 리뷰 삭제 권한을 복구할 수 없습니다. 실명·재직 여부·이메일을 확인하는 기능은 없습니다. 누구나 내용을 볼 수 있고 등록할 수 있으므로 공개 운영을 위한 게시물 관리 방법을 준비하세요.

## 배포 후 확인

- `/healthz`: 두 DB 연결 확인 후 200 `{"status":"ok"}`
- `/`, `/app.js`, `/model.js`, `/api/dining`: 로그인 없이 접근 가능
- 신규 방문자의 `/` 또는 `/api/dining` GET 응답: HttpOnly/SameSite 작성자 구분 쿠키(운영에서 Secure)
- 매장·리뷰 등록과 본인 리뷰 삭제: 정상 동작, 다른 브라우저에서는 삭제 불가
- 다른 사이트 Origin 또는 변조 쿠키를 이용한 쓰기: 거절
- `/api/auth/request`, `/api/auth/verify`, `/api/auth/me`: 404
- DB 파일 경로: 404
- 재시작 후 기존 쿠키로 본인 리뷰 구분과 등록 기록 유지
- `/preview`: 가상 데이터만 포함하는 정적 미리보기

`npm test`는 로컬 기능 검증이며 실제 Render 배포·공개 HTTPS·운영 백업 검증을 대신하지 않습니다. 기존 Netlify 미리보기는 수동 재업로드해야 바뀝니다.
