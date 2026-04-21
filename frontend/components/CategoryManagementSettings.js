import React, { useState } from 'react';
import { CheckCircle, Plus, Edit2, Trash2, Check, X } from 'lucide-react';

export default function CategoryManagementSettings({ 
  categories, 
  onSaveCategories, 
  showNotification 
}) {
  const [localCategories, setLocalCategories] = useState([...categories]);
  const [editingCategoryIdx, setEditingCategoryIdx] = useState(null);
  const [editCategoryData, setEditCategoryData] = useState({ name: '', description: '' });
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  const handleSaveCategoriesList = async (newCats) => {
    setLocalCategories(newCats);
    try {
      await onSaveCategories(newCats);
      showNotification('Categories saved successfully');
    } catch (err) {
      showNotification('Failed to save categories', 'error');
    }
  };

  const handleUpdateCategory = (idx) => {
    const newCats = [...localCategories];
    newCats[idx] = { ...editCategoryData };
    handleSaveCategoriesList(newCats);
    setEditingCategoryIdx(null);
  };

  const handleAddCategory = () => {
    if (!editCategoryData.name) return;
    const newCats = [...localCategories, { ...editCategoryData }];
    handleSaveCategoriesList(newCats);
    setIsAddingCategory(false);
    setEditCategoryData({ name: '', description: '' });
  };

  const handleDeleteCategory = (idx) => {
    const newCats = localCategories.filter((_, i) => i !== idx);
    handleSaveCategoriesList(newCats);
  };

  return (
    <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <h3 style={{ margin: 0, fontSize: '1.2em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <CheckCircle size={20} color="#10b981" /> Transaction Categories
        </h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={async () => {
              try {
                await fetch('/api/jobs/audit', { method: 'POST' });
                showNotification('Categorization audit job started. Check Jobs page.', 'success');
              } catch (e) {
                showNotification('Failed to start audit job', 'error');
              }
            }}
            style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            Run Categorization Audit
          </button>
          <button
            onClick={() => {
              setIsAddingCategory(true);
              setEditCategoryData({ name: '', description: '' });
            }}
            style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Plus size={16} /> Add Category
          </button>
        </div>
      </div>

      {isAddingCategory && (
        <div style={{ marginBottom: '20px', padding: '20px', background: '#ecfdf5', borderRadius: '16px', border: '1px solid #a7f3d0' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
              <label style={{ fontSize: '0.75em', fontWeight: 'bold', color: '#10b981' }}>Category Name</label>
              <input 
                placeholder="e.g. Groceries"
                value={editCategoryData.name}
                onChange={e => setEditCategoryData({...editCategoryData, name: e.target.value})}
                style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #a7f3d0' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 2 }}>
              <label style={{ fontSize: '0.75em', fontWeight: 'bold', color: '#10b981' }}>Description (for AI)</label>
              <input 
                placeholder="e.g. Supermarkets and food markets"
                value={editCategoryData.description}
                onChange={e => setEditCategoryData({...editCategoryData, description: e.target.value})}
                style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #a7f3d0' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={handleAddCategory}
                style={{ padding: '10px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Add
              </button>
              <button 
                onClick={() => setIsAddingCategory(false)}
                style={{ padding: '10px 20px', background: '#64748b', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {localCategories.map((cat, idx) => (
          <div key={idx} style={{ 
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
            padding: '12px 20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9'
          }}>
            {editingCategoryIdx === idx ? (
              <div style={{ display: 'flex', flex: 1, gap: '10px', alignItems: 'center' }}>
                <input 
                  value={editCategoryData.name}
                  onChange={e => setEditCategoryData({...editCategoryData, name: e.target.value})}
                  style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #10b981', outline: 'none', flex: 1 }}
                />
                <input 
                  value={editCategoryData.description}
                  onChange={e => setEditCategoryData({...editCategoryData, description: e.target.value})}
                  style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #10b981', outline: 'none', flex: 2 }}
                />
                <button onClick={() => handleUpdateCategory(idx)} style={{ color: '#10b981', background: 'none', border: 'none', cursor: 'pointer' }}><Check size={18} /></button>
                <button onClick={() => setEditingCategoryIdx(null)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{cat.name}</span>
                  <span style={{ fontSize: '0.85em', color: '#64748b' }}>{cat.description}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => {
                      setEditingCategoryIdx(idx);
                      setEditCategoryData({ name: cat.name, description: cat.description || '' });
                    }}
                    style={{ background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: '10px', color: '#64748b', cursor: 'pointer' }}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => handleDeleteCategory(idx)}
                    style={{ background: '#fef2f2', border: 'none', padding: '8px', borderRadius: '10px', color: '#ef4444', cursor: 'pointer' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}