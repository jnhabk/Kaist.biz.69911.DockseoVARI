# QUESTIONS.md

Team: 5조 (팀명 : 독서바리)
Last updated: 2026-10-03

Your biggest open questions about this project.
Write this together, after the premortem merge.

At most five, most important first.
The consultation opens with question 1, so put the one you are least sure about there, not the one that is easiest to ask.

Write in Korean or English.
Keep the headings exactly as they are.

\---

## What counts as an open question

* **The answer would change what you do next.** If every possible answer leaves your next two weeks the same, it is curiosity, not an open question.
* **It is specific to this project.** "Is our idea good?" cannot be answered in 30 minutes. "We assume the person in `PROJECT.md` will enter data by hand every day, and none of us has asked one. How do we test that in a week?" can.
* **You have already tried something.** Say what you think the answer is today, even if it is a guess. A question with a guess attached gets a much better answer than a bare one.

Two good places to look for questions:

* `docs/PREMORTEM.md` — a cause of failure you could not find a countermeasure for is a question.
* `docs/PROJECT.md` — the section you argued about longest, or the one where you wrote "nobody yet".

## Our questions

### 1\. 독서 기록이 부족하거나 원문을 쓸 수 없을 때, AI가 책에 없는 내용을 지어내지 않는 발제문을 어떻게 만들 수 있는가?

* **Why it matters:** 발제문은 이 제품의 핵심 기능이다. 지어낸 내용을 거를 방법이 없으면 발제문 기능 대신 "기록 정리"나 "객관식 질문 모음" 같은 더 단순한 형태로 데모 범위를 줄여야 한다. 방법이 있다면 그 방법을 먼저 구현해야 한다.
* **What we think today:** 베타테스트 시 입력이 부족하면 AI가 외부 정보를 너무 많이 끌어와 원문과 동떨어진 내용이 나올 수 있고, 걸러내는 기준은 자체적으로 세우지 못할 수 있다(PREMORTEM 6번). 현재 추정은 두 가지다. 하나는 AI가 모임원이 직접 쓴 기록만 참고하게 제한하고, 입력이 기준에 못 미치면 생성하지 않고 더 입력해 달라고 요청하는 방식이다. 다른 하나는 PREMORTEM 5번 섹션 3번 행처럼 외부 데이터로 객관식 질문지를 만들어 답변을 받아 입력을 보충하는 방식이다. 둘 다 아직 시험해 보지 않았다.
* **Who could answer it:** 교수님, 그리고 LLM 서비스를 만들어 본 경험이 있는 사람. 실제로 만들어서 시험해 보아야 알 수 있는 부분도 크다.





### 2\. 기록하는 수고는 모임 전에 바로 들지만 발제문과 추천이라는 혜택은 기록이 쌓인 뒤에야 돌아오는데, 멤버들이 모임 전에 정말 기록을 남길까요? 기록을 장려하는 방법에는 어떤 것들이 있을까요?

* **Why it matters:** 서비스 전체가 "멤버 기록이 쌓인다"는 가정 위에 있다. 프리모템에서도 3명이 이 문제를 실패 원인으로 꼽았다. 멤버들이 기록을 남긴다면 기록 → 발제문 흐름을 그대로 만든다. 남기지 않는다면 입력 방식부터 다시 설계해야 한다. 밑줄 사진 업로드나 객관식 질문지처럼 부담이 적은 방식을 찾거나, 기록하는 멤버 본인에게 돌아가는 혜택을 먼저 만들어야 한다. PROJECT.md에 적은 "아이디어를 접는 기준"도 이 질문에 달려 있다.
* **What we think today:** 최대한 다양한 형태의 기록 방법을 구현한다. (사진 OCR, 객관식 선지, 자율적인 저널링 등) 그리고 모임 전 적정 시점마다 푸쉬알림 등을 적극적으로 보내 기록을 장려한다.
* **Who could answer it:** 우리 독서모임과 외부 독서모임 1곳의 멤버들. 시범 방식이 충분한지는 교수님께도 의견을 묻고 싶다.(다른 서비스 사례 등)

### 

### 3\. 모임 책 추천 및 발제문에 필요한 도서 데이터를 저작권/API 이슈 없이 어디까지 가져올 수 있는가?

* **Why it matters:** Ai 기능이 가능한지가 이 답에 달려 있다. 쓸 수 있는 데이터가 서지 정보 수준이면 추천은 "취향 설문 기반"으로 바꾸고, 리뷰나 요약까지 쓸 수 있으면 지금 계획을 유지한다.
* **What we think today:** 밀리의서재 같은 전자책 플랫폼은 공개 API가 없다는 것을 10/2 회의에서 확인했다. 국립중앙도서관, 도서관 정보나루, 알라딘, 카카오의 도서 검색 API를 살펴볼 계획이지만, 아직 써 보지 않았다. 현재 추정은 서점이나 도서관의 공개 API로 제목, 저자, 표지, 소개글 정도는 가져올 수 있지만 원문은 불가능하고, 리뷰 데이터는 이용 조건이 막혀 있을 가능성이 크다는 것이다.
* **Who could answer it:** 각 API의 이용 약관과 문서 확인 후 호출해보며 확인할 예정, 그리고 교수님에게 조언을 구할 예정.



### 4\. 이 수업이 요구하는 구현 수준은 어디까지이고, 비전공자 4명이 Demo Day(12월 19일)까지 현실적으로 구현할 수 있는 범위는 어디까지인가?

* **Why it matters:** 이 답에 따라 10월 17일에 정할 "한 문장 데모 시나리오"의 크기가 달라진다. 실제로 동작하는 것을 요구하면 시나리오를 한 가지 흐름으로 줄이고, 설계와 검증 위주로 평가하면 구현을 줄이고 사용자 시험에 더 시간을 쓴다.
* **What we think today:** 팀을 같이 하고 싶은 마음이 앞서 수업이 요구하는 수준을 따져 보지 않았다(PREMORTEM 5번). 현재 추정은 기능이 여러 개 있는 것보다 한 가지 흐름이 처음부터 끝까지 실제로 도는 것이 평가에 유리하다는 것이다.  주요 기능( "멤버 기록 → AI 발제문" 등) 만 끝까지 돌아가게 하고, 일부는 시연용 데이터로 보여주면서 한계를 밝히는 것이 현실적이라고 본다.
* **Who could answer it:** 교수님.



### 5\. AI로 만든 결과물을 4명이 어떻게 나눠 만들고 합칠 수 있는가?

* **Why it matters:** 같은 프롬프트에서도 결과가 달라서 함께 만들기 어렵다는 지적이 있었고(정민영), 지금은 팀원 한 명(박진하)에게 구현이 몰릴 수 있다는 우려가 있다. 방법이 여의치 않으면 프로젝트가 실패할 수도 있어,  초기에는 구현에 집중하되, 지속적인 리뷰를 통해 타이트하게 일정 관리하고 후반부에 갈수록 발표 준비 시간을 확보해놓아야한다.
* **What we think today:** 5번 섹션 2번 행처럼 기능별 담당자를 지정하고 1\~2주에 한 번 결과물을 합쳐 서로 리뷰하는 방식을 계획했지만 아직 해 보지 않았다. 현재 추정은 기능 단위로 나누면 합치는 문제가 줄어든다는 것이다.
* **Who could answer it:** AI로 여러 사람이 함께 만들어 본 경험이 있는 사람, 교수님. 실제로 한 번 합쳐 보아야 알 수 있는 부분도 크다.



## Where we disagree

1. 멤버 기록이 부족할 때 어떻게 할 것인가 (1번 질문)

\- 한쪽 의견: 기록 방법을 다양하고 편하게 만들고, 그래도 부족하면 객관식 질문지 답변으로 발제문을 보완하면 된다. 객관식 답변만으로도 발제문이 나오는지 함께 시험한다.

\- 다른 쪽 의견: 멤버 기록이 쌓이지 않으면 "우리 모임의 기록으로 만든 발제문"이라는 차별점이 사라진다. 그러니 외부 데이터로 메우기보다, 시범에서 멤버 절반 이상이 기록을 남기지 않으면 방향을 다시 봐야 한다. PROJECT.md의 "아이디어를 접는 기준"이 이 방향이다.



2\. AI로 만든 결과물을 실제로 나누고 잘 합칠 수 있는지 (5번 질문) - 아직 모두에게 확신이 없음



## After the consultation

Fill this in within a week of your slot.

|#|What we heard|What we will do about it|Owner|By when|
|-|-|-|-|-|
|1|DRM 이슈로 책 원문에 대한 접근이 큰 진입장벽이 될 것|이전 학기 유사 프로젝트 진행 팀('Readinggo')과 미팅 진행, 최대한 원문 이용 없이 대체 서비스 고안|다 같이|10/24|
|2|어떤 경험을 주고 싶은지에 대한 고민을 통해 Product의 Why를 더 뾰족하게 만들 것|다음 수업에서 'Why Tree' 작업을 배워보고 적용|다 같이|10/17|
|3|AI를 써서 툴을 만들고, 툴 작동 기반에도 AI가 있게 해 볼 것|AI를 써서 Product를 만들고, 그 중 발제문과 큐레이션 기능에 AI를 활용|다 같이|11/14(Demo Review)|

## Revision log

|Date|What changed and why|
|-|-|
|2026-10-03|Draft for consultation|
|2026-10-05|Revised after consultation on 10/05: After the consultation filled|



