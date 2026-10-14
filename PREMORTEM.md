# PREMORTEM.md

Team: 5조, 팀명; 독서바리 
Members: 박진하, 박지수, 정민영, 김지원
Merged on: 2026-10-03
Last updated: 2026-10-03

> \\\*\\\*Order matters, and here it is the entire method.\\\*\\\*
> Every member first writes their own list in `docs/premortem/<name>.md`, alone.
> Only then does the team fill in this file.
>
> If you brainstorm as a group first, the first risk named anchors everyone else, and the quiet member's risk, which is usually the real one, never gets written down.
>
> Write content in Korean or English.
> Keep the headings exactly as they are.

\---

## 1\. Individual lists

|Member|File|Written on|Causes listed|
|-|-|-|-|
|정민영|`docs/premortem/정민영.md`|2026-10-03|5|
|박진하|`docs/premortem/Jinha.md`|2026-10-02|5|
|김지원|`docs/premortem/jiwon.md`|2026-10-02|5|
|박지수|`docs/premortem/박지수.md`|2026-10-03|5|

## 2\. Read-out

Go around the table.
One cause each, in turn, until every list is exhausted.
No debating during the read-out, and nobody reads their whole list at once.
People have to feel safe saying the awkward one, so the only allowed response is writing it down.

## 3\. The merged list

Every cause from every list goes here.
Stack the repeats into one row and keep the sharpest wording, not the most diplomatic one.
Cluster by problem, never by role or department: once a cluster is called "development", half the team decides it is somebody else's problem.

Sort by how many members raised it, most first.
The repeats are your priority signal, and you get it for free.
Break ties by expected damage.

Mark a cause with **(us)** when it exists because of who is on this team, not because of the software.
At least two rows must carry that mark: skill asymmetry, time asymmetry, who will actually debug the code the artificial intelligence (AI) wrote, who has a product launch at work in November, who agrees in meetings and then goes quiet.
A premortem with no **(us)** rows is a premortem about software, not about this team.

|#|Failure cause (past tense, specific)|Problem cluster|Raised by|How many|
|-|-|-|-|-|
|1|데모에 넣을 기능이 너무 많았다. 검색, 커뮤니티, Facilitator, 독서습관, 발제문, 추천을 한꺼번에 하려다 어느 하나도 제대로 동작하지 않았고, 데모에서 처음부터 끝까지 보여주는 데만 시간이 다 갔다. 첫 회의에서 각자의 아이디어를 서로 존중하다 보니 고르기만 하고 버리지 못했다. **(us)**|범위 과다|정민영, 박진하, 김지원, 박지수|4|
|2|발제문 기능을 AI 바이브 코딩 경험이 있는 진하 한 명이 거의 혼자 만들었고, 나머지 셋은 프롬프트와 걸러내는 로직을 몰라 돕지도 디버깅하지도 못했다. 진하에게 일이 몰려 기간 안에 서비스를 끝내지 못했다. **(us)**|한 사람에게 쏠린 병목|정민영, 김지원, 박지수|3|
|3|독서 기록 데이터가 쌓이지 않았다. 멤버마다 기록하는 정도가 달랐고, 한 번 기록한 뒤 다시 쓰지 않았고, 작성이 번거로웠다. 입력이 부족한 모임에서는 발제문과 추천이 제대로 나오지 않았고, AI가 외부 정보로 빈칸을 채웠다.|기록 입력과 지속 사용|박지수, 박진하, 김지원|3|
|4|도서 데이터를 쓸 수 없었다. 표지, 주요 내용, 추천에 필요한 외부 데이터가 저작권과 API 제공 범위에 막혔는데, 사전에 어떤 API와 DB를 쓸 수 있는지 확인하지 않아서 책 추천 기능이 계획대로 구현되지 못했다.|외부 도서 데이터와 저작권|박지수, 박진하|2|
|5|조원 4명이 모두 비전공자인데도 외부 API 연동, OCR 같은 아이디어를 그대로 밀고 갔고, 중간에 바이브 코딩으로 따라가 보려 했지만 소화하지 못해 데모 구현이 용두사미가 되었다. 팀을 같이 하고 싶다는 마음이 앞서 수업이 요구하는 수준을 따져보지 않았다. **(us)**|기술 역량 부족|정민영, 박진하|2|
|6|AI가 리뷰를 바탕으로 만든 발제문에 책에 없는 내용이 섞였고(Hallucination), 외부 정보를 거르는 기준을 세우지 못했다. 이를 어떻게 거르느냐는 질문에 우리 팀 누구도 제대로 답하지 못했다.|AI 출력 품질|박진하, 김지원|2|
|7|10월에는 김지원이 다른 과목 팀플 3개, 중간고사, 결혼식 3건으로, 11월 중순부터는 정민영이 자회사 통합 업무로 프로젝트에 거의 기여하지 못했다. 지원은 일정을 알고도 팀에 말하지 않았고, 일정을 조율하고 챙기는 리더가 없었다. **(us)**|시간 비대칭과 일정 조율|정민영, 김지원|2|
|8|누구는 독서 Facilitator, 누구는 검색과 커뮤니티, 누구는 독서모임 중 AI 도움을 떠올리는 등 같은 "독서"라는 소재에서 서로 다른 제품을 상상했고, 명확한 조율 없이 구현에 들어가서 방향이 맞지 않는 제품이 나왔다. **(us)**|비전 불일치|정민영|1|
|9|4명이 모두 기술 구현에만 매달려 발표용 테스트 세팅과 PPT 준비에 시간을 쓰지 못했고, 서비스가 성공했는지 판별할 수 없는 발표가 되었다. 처음 1-2명이 안 풀리자 다른 팀원도 붙었는데, 여러 명이 같이 코딩하면서 오히려 더 복잡해졌다. **(us)**|발표 준비 소홀|박진하|1|
|10|우리가 속한 독서모임 외에는 사용자가 한 명도 생기지 않았다. 홍보를 어떻게 할지 생각하지 못했다.|사용자 확보|박지수|1|
|11|데모 직전 Gemini 무료 API 호출 한도가 다 차서 AI 발제문 생성과 사진 속 밑줄 문장 텍스트 변환이 모두 멈췄다. 리허설을 집이나 회사의 안정적인 네트워크에서만 해서 실제 데모 환경에서 무엇이 멈출 수 있는지 확인하지 않았다.|데모 당일 환경|김지원|1|

Add rows until every individual list is used up.

## 4\. What only one person saw

Look again at every row above that a single member raised.

|Cause|Raised by|What we decided to do about it|
|-|-|-|
|8. 비전 불일치|정민영|"한 문장 데모 시나리오"를 팀 전원이 확인하는 것으로 함께 다룬다. 시나리오에 동의하지 않는 사람이 있으면 그 자리에서 말하고 기록한다.|
|9. 발표 준비 소홀|박진하|기능이 어느정도 구현된 후에는 발표 담당(데모 스크립트, 테스트 계정 세팅, PPT)을 지정해 발표를 준비하고, 나머지는 구현 담당은 2명 이내로 제한하여 마무리 작업에 집중한다.|
|10. 사용자 확보|박지수|대책의 외부 독서모임 시범 운영을 사용자 확보의 첫 시험으로 겸한다. 외부 사용자가 앱을 열어 본 횟수를 같이 기록한다.|
|11. 데모 당일 환경|김지원|12월 12일 리허설은 데모 당일과 같은 네트워크와 계정으로 하고, 무료 API 한도가 차는 경우를 대비해 미리 만든 결과 화면 또는 녹화본을 준비한다.|

A cause only one person saw is not a weak signal.
It is usually the one the rest of the team is structurally unable to see.

## 5\. The three we act on

Pick at most three.
More than three is a list, not a plan.

The top of the merged list is where you start looking, not an automatic answer.
If a cause only one person saw is the one that would end the project, pick it.

|#|Failure cause|Early warning signal — what we would actually observe, and when|Countermeasure — the action|Owner|By when|
|-|-|-|-|-|-|
|1|범위 과다: 기능이 너무 많아 어느 것도 제대로 동작하지 않았다. **(us)**|10/9 상담 때까지 "멤버 기록 → AI 발제문" 흐름을 한 문장으로 설명하는 말이 팀원마다 다르다. 회의에서 새 기능 제안이 나왔는데 빠지는 기능이 없다.|상담 후 모임에서 데모 시나리오(우선 순위 기능 UX 포함 : 취향 설문, 독서 기록, 발제문, 다음 책 추천)를 함께 작성한다. 시나리오에 없는 기능은 모두 "지금 안 함" 목록으로 옮긴 뒤 4명 모두 확인하고 최초 시나리오가 데모로 구현되었을 경우 기능을 추가한다. |정민영|10월 17일|
|2|한 사람에게 쏠린 병목: 데모 구현이 한두 명에게 몰리고 나머지는 로직을 몰랐다  **(us)**|<br />일주일 동안 작업물을 올리거나 수정한 사람이 1명뿐이다. 매주 회의에서 만든 사람이 아닌 팀원이 발제문 프롬프트를 설명하지 못한다.|<br /><br />데모시나리오를 통해 MVP의 이미지를 설정하고 4명이 각각 구현을 담당한 기능을 지정한다. <br /> 주기적(1\~2주에 1회)으로 각자 결과물을 통합하여 서로 리뷰를 진행하며 디벨롭한다. <br />|박진하|데모 시나리오 확정(10/17) 후 매주 토요일 수업 후 리뷰세션 진행|
|3|기록 입력 부족: 기록이 쌓이지 않아 발제문과 추천이 나오지 않았다.|다음 모임 3일 전까지 기록을 하나라도 남긴 멤버가 절반이 안 된다.|사용자가 기록하는 다양한, 편리한 방법들을 구현한다. (외부 독서모임 유저들의 의견 듣기 - 데모 시나리오에서 확정)<br />기록입력이 부족한 경우, 활용할만한 외부 데이터 API를 가져와서 객관식 질문지를 만들어 모임원의 답변을 참고해 발제문 도출에 참고하는 알고리즘 도입을 검토한다.|박지수, 김지원|데모 시나리오 확정(10/17) 후 매주 토요일 수업 후 리뷰세션 진행 |





Three tests every row must pass:

* **The signal is observable.** "We notice we are falling behind" is not a signal. "Two members have not opened the project in seven days" is.
* **The countermeasure is an action, not a posture.** "열심히 하기", "우선순위 관리", and "we will be careful" are intentions. "Call three potential users and write down what they say" is an action. If it has no verb, rewrite it.
* **The owner is one named person, and there is a date.** "The team" owns nothing. A countermeasure with no date is a countermeasure with no week: it never lands on anyone's calendar.

You do not need a 1-to-5 likelihood and impact matrix, and we would rather you did not add one.
It makes every risk look equally considered whether or not it was.

Everything in section 3 that is not in this table is a risk you are knowingly leaving alone for now.
That is a decision, and it is fine.

\---

## Revision log

Any change of direction needs a new row here within one week.
A premortem that analyzes a product you no longer build is worse than none, because it reads as covered.

|Date|What changed and why|
|-|-|
|2026-10-03|Draft for consultation|

\---

Method note: Gary Klein, "Performing a Project Premortem", Harvard Business Review, September 2007.

