from materials import load_manifest
if __name__=='__main__':
 m=load_manifest();print({'status':'valid','documentCount':len(m.documents),'documentIds':[d.documentId for d in m.documents]})
