# Premortem — \[박진하]

Team: 5조 - 박진하, 박지수, 정민영, 김지원
Written on: 2026-10-02

I wrote this before reading anyone else's list: \[yes]

Copy this file, rename it after yourself (for example `gildong.md`), and fill it in alone.
Do this before your team meets to merge, and do not read anyone else's list first.
Write your own list before you ask any artificial intelligence (AI).
An AI list anchors you the same way a teammate's would, and an AI does not know your team, so it can only give you the list every team would get.

Write in Korean or English, whichever you think in.
Keep the headings exactly as they are.

\---

## The premise

It is December 19, 2026.
Demo Day.
Your team's project failed.
Not "went okay" — failed, visibly, in front of the class.

You are writing the explanation of why.

Write in the past tense, as fact.
This is not a hedge-your-bets risk survey.
Asserting the failure is what makes the honest answers come out, and that is the whole reason the technique works.

## My list

Four minutes.
At least five causes.
Include the uncomfortable one.
In class you wrote three in four minutes, about yourself; this one is about the project, and you have longer.

|#|What happened (past tense, specific)|When it started|Why nobody stopped it|
|-|-|-|-|
|1|기능과다로 기능간 구현이 제대로 안됨|첫 회의부터 각자 독서모임에서 느꼈던 다양한 아이디어를 내놓음|각자 원하고 체감했던 필요기능들이 많았기때문에 상대방의 제안을 냉정하게 추려내지 못함|
|2|모임원이 사전 기록해야하는 데이터가 부족해서  Ai가 적절한 발제문을 도출하지 못해 후속단계로 진행이 안됨/Hallucination 다량 발생|데모버전 배포 후 베타테스트 결과 충분한 input이 없어서 Ai가 외부 정보를 너무 많이 끌어옴/외부데이터(저작권이슈로 원문 참고 불가하므로 책 리뷰 데이터 등)가 원문 내용과 동떨어진 경우가 많음 |데이터를 많이 끌어와야하므로 베타테스트 대상인원이 부족했고, Ai 가 참고할 외부 정보 필터링 기준을 세우는데에 실패함 (관련 지식이 부족했음)|
|3|도서 관련 데이터 참조 불가 (독서모임 운영에 필요한 도서나 외부 데이터 API등이 제한적이라 우리가 구현하고자 하는대로 실현이 안됨)|데모 제작과정에서, 모임 도서 추천이나, 책 표지, 주요 내용들을 불러오는 과정에서 저작권 이슈 및 API 제공여부 등의 이슈 발생|DB나 API를 사전에 확인하지 못했음 |
|4|데모 기술적 구현 실패|팀 결성부터. 우리 모두 코딩에 지식이 없는 팀원이었음. <br /> 중간에 바이브코딩 수준으로 따라가보려했으나 소화가 부족하였음|같이 팀플을 하고 싶다는 마음만 앞섰음 (본 수업이 요구하는 수준에 대한 면밀한 검토가 부족했음)|
|5|발표 실패 <br />(기술적 구현에만 4명이 모두 매달리느라 발표를 위한 Test 세팅, PPT 준비 등에 아예 시간을 못 쏟아서 본 서비스에 대한 시현이나 성공여부를 판별할 수 없게됨)|데모를 만들기 시작한 순간부터.|일단 서비스를 구현해야 발표가 가능하기 때문에, 최초 담당자 1-2명이 시도하다가 안되다 보니 다른 팀원도 붙음. 오히려 여러 명이 코딩하면서 더 복잡해진 여파도 있었음 |

Three rules:

* **Past tense, specific.** "We never got one user outside our own team", not "user acquisition may be difficult".
* **Not generic.** "Scope creep" and "the team got busy" are true of every failed project ever, so they carry no information. What specifically crept? Who specifically got busy, in which week, because of what?
* **At least two causes involve the people in this team, and at least one of those is about you.** Skill gaps, who actually understands the code the AI wrote, who has a product launch at work in November, who says "sure" in meetings and disappears. If your list is all technical, it is a safe list, not an honest one.

