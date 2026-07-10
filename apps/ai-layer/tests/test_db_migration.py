from ai_layer.db.migrate import include_name, include_object


def test_include_name_only_ai_layer():
    assert include_name("public", "schema", {}) is False
    assert include_name("drizzle", "schema", {}) is False
    assert include_name("ai_layer", "schema", {}) is True
    # non-schema names (tables) are not filtered here
    assert include_name("facts", "table", {"schema": "ai_layer"}) is True


def test_include_object_rejects_non_ai_layer_tables():
    class T:
        def __init__(self, schema):
            self.schema = schema

    assert include_object(T("public"), "users", "table", True, None) is False
    assert include_object(T("ai_layer"), "facts", "table", False, None) is True
    # non-table objects pass through
    assert include_object(object(), "ix", "index", False, None) is True
