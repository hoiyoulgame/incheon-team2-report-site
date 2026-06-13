혼매인천 대형마트 체크 리스트 GitHub 배포 방법

1. GitHub에서 새 저장소를 만듭니다.
   추천 저장소명: incheon-team2-report-site

2. 저장소를 만든 뒤 GitHub가 안내하는 HTTPS 주소를 복사합니다.
   예시:
   https://github.com/YOUR_ID/incheon-team2-report-site.git

3. 이 폴더에서 아래 명령을 한 번만 실행합니다.
   git remote add origin https://github.com/YOUR_ID/incheon-team2-report-site.git
   git push -u origin main

4. GitHub 저장소 화면에서 Settings > Pages로 이동합니다.
   Source 또는 Build and deployment 항목을 GitHub Actions로 선택합니다.

5. 배포가 끝나면 GitHub Pages 주소가 생성됩니다.
   이후 매니저에게는 이 주소 하나만 공유하면 됩니다.

업데이트 방법

1. raw 파일을 교체합니다.
2. RUN_BUILD.cmd를 실행합니다.
   모델 검색 DB까지 새로 갱신할 때만 RUN_BUILD_FULL.cmd를 실행합니다.
3. 결과를 확인합니다.
4. PUBLISH_TO_GITHUB.cmd를 실행합니다.
5. 1-3분 후 매니저가 같은 URL을 새로고침하면 최신 자료가 보입니다.

주의

- raw 폴더의 엑셀 원본은 .gitignore로 제외되어 GitHub에 올라가지 않습니다.
- GitHub에는 public 폴더의 최종 HTML 결과와 생성 스크립트만 올라갑니다.
- GitHub Pages는 정적 홈페이지라서 서버처럼 파일 업로드 즉시 자동 반영되는 방식은 아닙니다.
  빌드 후 GitHub에 push한 시점의 결과가 배포됩니다.
