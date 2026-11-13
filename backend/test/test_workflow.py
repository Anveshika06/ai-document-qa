"""Offline integration tests with fake vectors and fake model; no network usage."""
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rag import AnswerPayload, RAGService


class FakeDocument:
    def __init__(self, page_content, metadata):
        self.page_content = page_content
        self.metadata = metadata


class FakeSplitter:
    def split_documents(self, docs):
        return docs


class FakeVectors:
    def __init__(self):
        self.items = {}
    def add_documents(self, docs, ids):
        self.items.update(zip(ids, docs))
    def delete(self, ids):
        for i in ids:
            self.items.pop(i, None)
    def similarity_search_with_score(self, q, k, filter):
        ids = filter['doc_id']['$in']
        return [(doc, 0.12) for doc in self.items.values() if doc.metadata['doc_id'] in ids][:k]


class FakeModel:
    def with_structured_output(self, schema):
        return self
    def invoke(self, prompt):
        return AnswerPayload(answer='Manager approval required.', source_ids=['S1'], needs_review=False)


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.vectors = FakeVectors()
        mod = types.ModuleType('langchain_core.documents')
        mod.Document = FakeDocument
        self.modules = patch.dict(sys.modules, {'langchain_core.documents': mod})
        self.modules.start()
        self.service = RAGService(self.tmp.name, vectors=self.vectors, model=FakeModel(), splitter=FakeSplitter())

    def tearDown(self):
        self.modules.stop()
        self.tmp.cleanup()

    def test_ingest_answer_and_no_reembedding_on_query(self):
        indexed = self.service.ingest('Travel Policy', 'policy', ['Flights need manager approval.'])
        self.assertEqual(indexed['chunks'], 1)
        again = self.service.ingest('Travel Policy', 'policy', ['Flights need manager approval.'])
        self.assertTrue(again['duplicate'])
        out = self.service.ask('Who approves flights?')
        self.assertEqual(out['source_ids'], ['S1'])
        self.assertEqual(out['sources'][0]['page'], 1)
        self.assertFalse(out['needs_review'])
        self.assertEqual(len(self.vectors.items), 1)

    def test_old_policy_excluded_and_removed_policy_rejected(self):
        first = self.service.ingest('Travel Policy', 'policy', ['Old 2025 policy'])['document']['id']
        second = self.service.ingest('Travel Policy', 'policy', ['New 2026 policy'])['document']['id']
        self.assertEqual(len(self.service.catalog.list_documents()), 1)
        answer = self.service.ask('Current terms?')
        self.assertEqual(answer['sources'][0]['document_id'], second)
        with self.assertRaisesRegex(ValueError, 'no longer current'):
            self.service.ask('Old terms?', [first])
        self.assertTrue(self.service.remove(second))
        self.assertEqual(len(self.vectors.items), 1)  # old historical vector retained, but never searched
        with self.assertRaisesRegex(ValueError, 'no longer current'):
            self.service.ask('New terms?', [second])


if __name__ == '__main__':
    unittest.main()
