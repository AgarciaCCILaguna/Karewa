import Vue from 'vue';
import BackButton from '@/components/general/BackButton';
import CatalogHeader from '@/components/catalogs/Header';
import EditableTable from '@/components/tables/EditableTable';
import NewEntryModal from '@/components/catalogs/NewEntryModal';
import AdminMainSection from '@/components/admin/AdminMainSection';

import { mapState } from 'vuex'

export default {
    configure: ({storeModule, docName}) => {
        return {
            data: function () {
                return {
                    docName: docName
                }
            },
            components: {
                BackButton,
                CatalogHeader,
                EditableTable,
                NewEntryModal,
                AdminMainSection
            },
            computed: {
                ...mapState({
                    docs: state => state[storeModule].docs,
                    // selectedDocId: state => state[storeModule].selectedDocId,
                    entrySelected : state => Vue.util.extend({}, state[storeModule].entrySelected)
                })
            },
            methods: {
                testList: function () {
                    Vue.$log.info('this.$store', this.dispatch(`${storeModule}/list`));
                },
                deleteElementSelected : function(){
                    this.$store.dispatch(`${storeModule}/delete`, this.selectedDocId);
                }
            },
            beforeMount() {
                this.$store.dispatch(`${storeModule}/list`);
                this.$store.commit(`${storeModule}/setDocName`, {docName: docName});
            }
        }
    }
}
