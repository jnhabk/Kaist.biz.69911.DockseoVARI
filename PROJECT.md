# PROJECT.md

Team: 5조, 팀명 : 독서바리
Members: 김지원, 박지수, 박진하, 정민영
Last updated: 2026-10-03

One page.
Draft it together before anyone writes a premortem, and come back to it after the merge.

You are not committing to this.
You are making it concrete enough to argue about, and concrete enough that a premortem about it means something.
A project idea you cannot imagine failing in a specific way is not yet an idea.

Later in the term you will run a Why Tree on this, and the Why Tree may well move it.
That is expected, and it is not wasted work.

Write in Korean or English.
Keep the headings exactly as they are.

\---

## What we think we are building

초대받은 멤버만 들어오는 독서모임 전용 공간을 만들려고 한다.

멤버들이 책을 읽으며 밑줄 그은 문장과 생각을 이곳에 쌓으면, AI가 이를 모아 그 모임에 맞는 발제 질문과 다음 책 후보를 제안한다.

모임장은 발제와 책 선정을 처음부터 혼자 준비하지 않고, 멤버들의 기록에서 시작할 수 있게 된다.

## Who it is for

* **Person:** 회사 동료, 학교 동기, 친구처럼 아는 사람끼리 꾸린 소규모 독서모임(5\~10명, 월 1회 안팎). 초대로만 들어오는 폐쇄형 공간이라 모임장과 멤버가 함께 써야 성립한다. 모임장은 공간을 만들고 멤버를 초대해 발제를 준비하고, 멤버는 읽으며 밑줄 그은 문장과 생각을 남긴다. 트레바리처럼 운영사가 모임장을 두는 유료 모임은 대상에서 제외한다.
* **Situation:** 모임 3\~4일 전, 모임장이 발제 질문을 만들어야 하는데 멤버들이 어디까지 읽었는지, 어떤 문장에 밑줄을 그었는지, 어디서 생각이 갈렸는지 모르는 상태다. 다음 책을 정할 때에도 멤버들의 취향을 모른 채 긴 논의 없이 책을 고르는 상황이 많고, 모임이 끝나면 나눈 이야기가 남지 않는다. 멤버 입장에서는 읽으며 든 생각을 남겨 둘 곳이 마땅치 않아 모임 날에 떠오르는 기억에 의존하고, 다른 멤버가 같은 장면을 어떻게 읽었는지는 모임 자리에서야 처음 알게 된다.
* **What they do today instead:** 발제 아이디어는 ChatGPT 같은 AI 검색이나 트레바리 등의 후기에서 얻는다. 밑줄 그은 문장은 각자 사진을 찍거나 전자책 앱, 노션에 따로 남기고, 진도 확인과 공지, 후기는 단톡방에서 흘려보낸다. 첫 책은 모임장이나 목소리 큰 멤버가 정한다.

## How we know this problem is real

팀원 4명 모두 MBA 동기 독서모임에 모임장이나 참여자로 참여하고 있고, 9/24와 10/2 회의에서 각자 겪은 불편을 이야기하며 위 상황이 공통적으로 나왔다.

비슷한 해외 서비스(Bookclubs)는 모임 일정, 토론 가이드, 책 선정 투표를 제공한다. Fable 같은 독서 앱은 챕터별 피드와 진도 기록을 제공한다. 하지만 두 서비스 모두 멤버들의 기록을 그 모임의 발제 재료로 쓰지는 않는다는 것을 확인했다.

아직 팀 밖의 독서모임 모임장이나 참여자와는 이야기해 보지 않았다.



## Why us

\- 4명 모두 지금 같은 독서모임에서 활동하고 있어서, 실제 사용자 집단에 바로 접근하고 매달 열리는 모임에서 직접 시험해 볼 수 있다.

\- 모임장과 참여자 경험이 모두 있어서 두 입장의 불편을 함께 볼 수 있다.

\- 팀원들이 ChatGPT, Claude, Gemini 등 여러 AI 도구 활용해서 독서모임을 포함한 독서활동에 쓰려고 노력해왔다.



## What would make us drop this idea

10월 말까지 우리 MBA 독서모임과 외부 독서모임 1곳에서 기록과 피드백을 받아 보았을 때(PREMORTEM 대응 3번), 두 모임 모두 멤버 절반 이상이 모임 3일 전까지 문장이나 생각을 하나도 남기지 않으면 이 방향을 접는다.

멤버 기록이 쌓이지 않으면 발제 질문도, 다음 책 추천도 만들 재료가 없기 때문이다.



\---

## Revision log

|Date|What changed and why|
|-|-|
|2026-10-02|10/2 팀 미팅 반영: 서비스를 '초대 기반 모임 공간 + 멤버 기록(밑줄 문장 포함) 기반 AI 발제와 책 추천'으로 구체화하고, 첫 책 선정 상황을 추가함. 아이디어를 접을 기준을 '멤버들이 기록을 남기는가'로 바꿈. 대상을 MBA 동기 모임에서 '지인끼리 꾸린 소규모 독서모임'으로 넓히고, 폐쇄형 공간이므로 모임장/멤버의 우선순위 구분을 없앰|
|2026-10-03|Draft for consultation. PREMORTEM과 QUESTIONS 작성 후 반영: 멤버 입장의 상황(생각을 남길 곳이 없고 다른 해석을 모임에서야 앎)을 추가하고, 유사 서비스로 Fable 조사 결과를 넣고, 아이디어를 접을 기준을 PREMORTEM 대응 3번의 구글폼 시범(우리 모임 + 외부 모임 1곳)에 맞춤|
||Revised after consultation on \[date]: \[what changed]|



