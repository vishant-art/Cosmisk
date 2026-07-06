from ai_layer.db import repository as repo


def test_brand_config_roundtrip(db_session):
    kit = {"brand_name": "Acme", "palette": [{"role": "primary", "hex": "#112233"}]}
    repo.upsert_brand_config("act_1", kit)
    assert repo.get_brand_config("act_1") == kit
    repo.upsert_brand_config("act_1", {"brand_name": "Acme2"})
    assert repo.get_brand_config("act_1")["brand_name"] == "Acme2"
    assert repo.get_brand_config("nope") is None


def test_save_and_load_job_account_mode(db_session):
    job = {"job_id": "j1", "status": "complete", "stage": "Done", "progress": ["a", "b"],
           "run_id": "j1", "assets": [{"fmt": "1:1", "url": "/x.png"}], "video": None,
           "brand_kit": {"brand_name": "Acme"}, "winners": [], "cost_usd": 1.23,
           "rejected": [], "error": None, "account_id": "act_1"}
    repo.save_job(job)  # brand_id defaults to account_id
    back = repo.load_job("j1")
    assert back["status"] == "complete" and back["cost_usd"] == 1.23
    assert back["assets"] == [{"fmt": "1:1", "url": "/x.png"}]
    assert back["brand_kit"] == {"brand_name": "Acme"}
    assert repo.load_job("j1", brand_id="act_1")["job_id"] == "j1"
    assert repo.load_job("j1", brand_id="other") is None


def test_save_job_brief_mode_nullable_brand(db_session):
    repo.save_job({"job_id": "brief1", "status": "queued", "progress": [],
                   "assets": [], "winners": [], "rejected": [], "cost_usd": 0.0})
    assert repo.load_job("brief1")["status"] == "queued"  # no brand_id, no crash
