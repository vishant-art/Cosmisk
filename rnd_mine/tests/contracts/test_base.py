from creative_studio.contracts.base import ContractBase, new_id, utc_now

class Thing(ContractBase):
    object_type: str = "Thing"
    some_field: int = 1

def test_camel_case_round_trip():
    t = Thing(id=new_id("thing"))
    doc = t.to_doc()
    assert doc["schemaVersion"] == "2.0" and doc["objectType"] == "Thing"
    assert "someField" in doc and "createdAt" in doc
    assert Thing.model_validate(doc).some_field == 1

def test_new_id_prefix():
    assert new_id("prod").startswith("prod_") and len(new_id("prod")) == 5 + 12

def test_utc_now_is_iso_z():
    assert utc_now().endswith("Z") and "T" in utc_now()
