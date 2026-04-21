# Backlog — Deferred Features

## #14 직급별 단가 + 협업 코드 (deferred from S6)

**원본 피드백** (김미진, 2026-04-16):
> 협업코드도 있어,
> 1) 협업유무 및
> 2) PM, staff외에 예산 수립시 고려(time code 생성시 입력값)되는
>    직급별 입력 값을 넣을 수 있는지 궁금합니다.
> 예산 CM 등은 직급별 단가를 고려하여 산정되고 있어서,
> 이 점 들이 고려될 수 있는지 궁금합니다.

**왜 별도 sub-project 인가:**

1. 직급별 단가표 (rate table) 가 신규 데이터 모델로 필요
2. "협업 코드" 의 정의·운영 방식이 불명확 (PwC 내부 도메인 인터뷰 필요)
3. Time code 생성 시 백엔드 로직과 연동 필요
4. 예산 CM(원가) 산정 공식 — 도메인 전문가의 결정 사항

**다음 단계 권장:**

- 김미진/재무팀과 직급별 cost rate 정의 인터뷰
- "협업 코드" 운영 ruleset 확정
- 신규 spec 작성 → 별도 sub-project 사이클 (S7+ 또는 별도 브랜치)
- 영향 범위: project_members 모델 확장 + Step 2 UI + Step 3 cost 계산 + Summary CM 컬럼
