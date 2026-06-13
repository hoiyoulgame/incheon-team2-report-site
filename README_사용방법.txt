인천2팀 매니저 업무 리포트 사이트
========================================

목표
----------------------------------------
이 폴더 하나에서 raw 파일 입력, 에어컨 모델 설정, HTML 리포트 생성, 홈페이지 반영까지 처리합니다.
나중에 GitHub/Vercel에 올릴 때는 public 폴더가 실제 배포 대상입니다.


폴더 구조
----------------------------------------
raw\aircon
  에어컨 재고 raw 엑셀 파일을 넣는 곳입니다.
  여러 파일이 있으면 가장 최근 수정된 엑셀 파일을 사용합니다.

raw\msis
  MSIS raw 파일을 넣는 곳입니다.
  2025년 실판매 xls, 2026년 실판매 xls가 필요합니다.
  판매목표 xlsx는 있으면 같이 반영됩니다.

raw\reference
  TV 구재고 참고 엑셀 파일을 넣는 곳입니다.
  권장 파일명은 tv_old_model_reference.xlsx 입니다.

config\aircon_models.txt
  에어컨 주력 모델과 TOP 모델을 관리하는 파일입니다.
  #으로 시작하는 줄은 설명으로 처리되어 자동 무시됩니다.

config\aircon_settings.txt
  에어컨 리포트 제목과 기준일을 관리하는 파일입니다.

public\index.html
  매니저에게 공유할 메인 홈페이지입니다.

public\reports
  생성된 HTML 리포트가 들어가는 폴더입니다.

public\model-search.html
  LG전자 제품 모델 검색 화면입니다.

public\data\lg_catalog.json
  모델 검색 화면에서 사용하는 제품 검색 DB입니다.


사용 방법
----------------------------------------
1. raw\aircon 폴더에 에어컨 재고 엑셀 파일을 넣습니다.
2. raw\msis 폴더에 MSIS 2025/2026 실판매 파일과 판매목표 파일을 넣습니다.
3. raw\reference 폴더에 TV 구재고 참고 엑셀 파일을 넣습니다.
4. config\aircon_models.txt에서 주력 모델과 TOP 모델을 수정합니다.
5. 평소에는 RUN_BUILD.cmd를 더블클릭합니다.
6. public\index.html을 열어 결과를 확인합니다.


빌드 파일 구분
----------------------------------------
RUN_BUILD.cmd
  실적 Review와 에어컨 통합 리포트만 빠르게 갱신합니다.
  LG 모델 검색 DB는 기존 파일을 유지합니다.

RUN_BUILD_FULL.cmd
  실적 Review, 에어컨 통합 리포트, LG 모델 검색 DB를 모두 갱신합니다.
  LG전자 홈페이지를 읽어 public\data\lg_catalog.json을 새로 만들기 때문에 시간이 더 걸립니다.
  모델 DB는 매일 갱신하기보다 주 1회 또는 신제품 확인이 필요한 날에 갱신하는 것을 권장합니다.


에어컨 모델 입력 방법
----------------------------------------
일반 모델:
FQ18GV6EE2.AKOR
SQ07GA3WBS.AKOR

TOP 모델:
TOP1 FQ18GV3BB2.AKOR
TOP2 FQ18GC4EB2.AKOR
TOP3 FQ19GU1ED2.AKOR

메모:
# 이번 주 집중 모델

#으로 시작하는 줄은 자동으로 제외되므로 메모를 편하게 남겨도 됩니다.


현재 방식
----------------------------------------
현재 빌드는 기존 검증된 생성기 폴더를 엔진처럼 사용합니다.
- ..\aircon-unified-generator
- ..\lg-msis-html-report

이 새 폴더는 raw 파일과 설정을 받아서 기존 엔진에 전달하고, 생성된 결과만 public\reports로 모읍니다.
따라서 기존 두 BAT 파일을 따로 실행하거나 결과 HTML을 직접 복사할 필요가 없습니다.

TV 구재고 참고 파일도 raw\reference 안의 파일을 우선 사용합니다.
앞으로는 새 프로젝트 폴더 안에만 데이터 파일을 넣는 방식으로 관리하면 됩니다.


GitHub/Vercel 배포 방향
----------------------------------------
1. 이 폴더를 GitHub 저장소로 올립니다.
2. public 폴더를 Vercel 또는 GitHub Pages의 배포 대상으로 설정합니다.
3. 로컬에서 RUN_BUILD.cmd로 리포트를 갱신한 뒤 GitHub에 push하면 매니저 공유 URL도 최신화됩니다.
4. LG 모델 검색 DB까지 최신화해야 할 때는 RUN_BUILD_FULL.cmd를 실행한 뒤 push합니다.

추후 완전 자동화를 하려면 GitHub Actions 또는 Vercel Build에서 scripts\build_all.ps1을 실행하도록 바꾸면 됩니다.
다만 raw 파일에 업무 데이터가 포함될 수 있으므로 public 공개 범위와 raw 파일 업로드 정책은 먼저 정해야 합니다.
