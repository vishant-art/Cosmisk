from sqlalchemy import select

from ai_layer.db import models as m


def test_rows_do_not_leak_between_tests_write(db_session):
    db_session.add(m.Brand(brand_id="harness_probe", brand_name="x"))
    db_session.flush()
    assert db_session.execute(
        select(m.Brand).where(m.Brand.brand_id == "harness_probe")).scalar_one()


def test_rows_do_not_leak_between_tests_check(db_session):
    # the previous test's write was rolled back
    assert db_session.execute(
        select(m.Brand).where(m.Brand.brand_id == "harness_probe")).scalar_one_or_none() is None
