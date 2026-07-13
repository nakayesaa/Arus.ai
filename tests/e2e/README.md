# End-to-end tests

Playwright coverage will exercise the P0 operator path against deterministic synthetic seed data:

1. login and dashboard;
2. invoice CSV preview and commit;
3. queue and communication;
4. promise and dispute lifecycle;
5. partial/full payment;
6. weekly report.

E2E must never target production or depend on production data.
